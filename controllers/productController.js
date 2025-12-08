import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import Store from '../models/Store.js';
import User from '../models/User.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import StoreCategory from '../models/StoreCategory.js';
import mongoose from 'mongoose';
import { signedUrl } from '../helper/s3.config.js';
import { getDistance } from "geolib";

let limit = process.env.LIMIT;
limit = limit ? Number(limit) : 10;

const { ObjectId } = mongoose.Types;

const applyPrimaryImageFallback = (productDoc = {}) => {
  const imagesArray = Array.isArray(productDoc.productImages)
    ? productDoc.productImages
    : [];
  return {
    ...productDoc,
    primaryImage: productDoc.primaryImage || imagesArray[0] || null,
  };
};

const extractProductImageKeys = (files = []) => {
  if (!Array.isArray(files) || !files.length) return [];
  return files
    .map((file) => file?.key || file?.location || file?.path)
    .filter((key) => typeof key === "string" && key.trim().length)
    .map((key) => key.trim());
};

const parseProductImagesField = (incoming) => {
  if (!incoming) return [];
  if (Array.isArray(incoming)) {
    return incoming
      .filter((img) => typeof img === "string" && img.trim().length)
      .map((img) => img.trim());
  }
  if (typeof incoming === "string") {
    try {
      const parsed = JSON.parse(incoming);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((img) => typeof img === "string" && img.trim().length)
          .map((img) => img.trim());
      }
    } catch (err) {
      // ignore JSON parse errors and fallback to comma separated parsing
    }
    return incoming
      .split(",")
      .map((img) => img.trim())
      .filter((img) => img.length);
  }
  return [];
};

const mergeProductImages = (...lists) => {
  const flat = lists.flat().filter(Boolean);
  return [...new Set(flat)];
};

const parseDescriptionField = (incoming) => {
  if (!incoming) return [];
  let details = incoming;
  if (typeof incoming === "string") {
    try {
      details = JSON.parse(incoming);
    } catch (error) {
      return [];
    }
  }
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .map((item) => ({
      title: (item?.title || "").toString().trim(),
      details: (item?.details || "").toString().trim(),
    }))
    .filter((item) => item.title || item.details);
};

function calculateDiscount(mrp, sellingPrice) {
    if (mrp <= 0 || sellingPrice < 0 || sellingPrice > mrp) {
        return "Invalid prices";
    }
    let discount = ((mrp - sellingPrice) / mrp) * 100;
    return discount.toFixed(2) + "% OFF";
}

const parseUnitsField = (rawUnits) => {
    if (!rawUnits) return [];
    if (Array.isArray(rawUnits)) return rawUnits;
    if (typeof rawUnits === "string") {
        try {
            const parsed = JSON.parse(rawUnits);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return [];
        }
    }
    return [];
};

const normalizeUnits = (unitPayloads = []) => {
    const normalized = [];
    for (const unit of unitPayloads) {
        if (!unit) continue;
        const label = (unit.label || unit.qty || "").toString().trim();
        const qtyValue = unit.qty ? unit.qty.toString().trim() : label;
        const mrp = Number(unit.mrp);
        const sellingPrice = Number(unit.sellingPrice);

        if (!label || isNaN(mrp) || isNaN(sellingPrice)) {
            continue;
        }

        const offPer = calculateDiscount(mrp, sellingPrice);
        if (offPer === "Invalid prices") {
            continue;
        }

        normalized.push({
            label,
            qty: qtyValue,
            mrp,
            sellingPrice,
            offPer
        });
    }
    return normalized;
};

const slugifyKey = (value = "") => {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || null;
};

const parseVariantGroupsField = (rawGroups) => {
    if (!rawGroups) return [];
    let source = rawGroups;
    if (typeof rawGroups === "string") {
        try {
            source = JSON.parse(rawGroups);
        } catch (error) {
            return [];
        }
    }

    if (!Array.isArray(source)) return [];

    const normalized = [];
    source.forEach((group) => {
        if (!group) return;
        const name = (group.name || group.label || "").toString().trim();
        if (!name) return;

        let options = group.options ?? group.values ?? [];
        if (typeof options === "string") {
            options = options
                .split(",")
                .map((opt) => opt.trim())
                .filter(Boolean);
        }
        if (!Array.isArray(options)) return;

        const normalizedOptions = options
            .map((opt) =>
                typeof opt === "string"
                    ? opt.trim()
                    : (opt?.value || opt?.label || "").toString().trim()
            )
            .filter(Boolean);

        if (!normalizedOptions.length) return;

        normalized.push({
            key: (group.key && group.key.toString().trim()) || slugifyKey(name) || undefined,
            name,
            options: normalizedOptions,
        });
    });

    return normalized;
};

const parseNonNegativeNumber = (value, defaultValue = 0) => {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return Math.floor(parsed);
};

const parseOptionalObjectId = (value) => {
    if (value === undefined || value === null || value === "") {
        return { value: null, valid: true };
    }
    if (ObjectId.isValid(value)) {
        return { value: new ObjectId(value), valid: true };
    }
    return { value: null, valid: false };
};

export const uploadProductImage = async (req, res) => {
    try {
        signedUrl(req, res, 'Product/')
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('uploadProductImage', error, req, res);
    }
}

/**
 * @route   POST /api/retailer/create/product/v1
 * @desc    Create a product under a retailer's store
 * @access  Private (Retailer)
 */
export const createProduct = async (req, res) => {
    try {
      const { productName, companyName, mrp, sellingPrice, information, storeId, qty, units, description } = req.body;

      const parsedUnits = parseUnitsField(units);
      const normalizedUnits = normalizeUnits(parsedUnits);

      if (parsedUnits.length && normalizedUnits.length === 0) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid units provided. Please check qty, MRP and selling price.",
        });
      }

      const primaryUnit = normalizedUnits[0];
  
      // ✅ Validate mandatory fields
      if (!productName || !companyName || !information || !storeId) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message:
            "Please provide all product details (productName, companyName, information, storeId)",
        });
      }
  
      const baseMrp = primaryUnit ? primaryUnit.mrp : mrp;
      const baseSellingPrice = primaryUnit ? primaryUnit.sellingPrice : sellingPrice;

      if (baseMrp === undefined || baseSellingPrice === undefined) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Please provide MRP and Selling Price or add at least one unit.",
        });
      }

      // ✅ Convert numeric fields to Number
      const parsedMrp = Number(baseMrp);
      const parsedSellingPrice = Number(baseSellingPrice);
  
      if (isNaN(parsedMrp) || isNaN(parsedSellingPrice)) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "MRP and Selling Price must be valid numbers",
        });
      }
  
      // ✅ Image Handling
      const productImages = mergeProductImages(
        parseProductImagesField(req.body?.productImages),
        extractProductImageKeys(req.files)
      );
  
      // ✅ Verify Store Ownership (fixed ObjectId mismatch issue)
      const store = await Store.findById(storeId);
      if (!store) {
        return res.status(status.NotFound).json({
          status: jsonStatus.NotFound,
          success: false,
          message: "Store not found",
        });
      }
  
      // Convert both IDs to string for comparison
      if (store.createdBy.toString() !== req.user._id.toString()) {
        return res.status(status.Forbidden).json({
          status: jsonStatus.Forbidden,
          success: false,
          message: "You are not the owner of this store",
        });
      }
  
      // ✅ Calculate discount percentage
      const offPer = calculateDiscount(parsedMrp, parsedSellingPrice);
      if (offPer === "Invalid prices") {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid MRP or Selling Price. MRP must be greater than Selling Price",
        });
      }

      const finalQtyValue = primaryUnit ? (primaryUnit.qty || qty) : qty;
      const parsedDetails = parseDescriptionField(description);
      const categoryParse = parseOptionalObjectId(req.body.category || req.body.categoryId);
      if (!categoryParse.valid) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid category selected.",
        });
      }
      const subCategoryParse = parseOptionalObjectId(req.body.subcategory || req.body.subCategoryId);
      if (!subCategoryParse.valid) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Invalid subcategory selected.",
        });
      }

      const parsedStock = parseNonNegativeNumber(req.body.stock, 0);
      if (parsedStock === null) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Stock must be a non-negative number.",
        });
      }

      const parsedLowStockThreshold = parseNonNegativeNumber(
        req.body.lowStockThreshold,
        5
      );
      if (parsedLowStockThreshold === null) {
        return res.status(status.BadRequest).json({
          status: jsonStatus.BadRequest,
          success: false,
          message: "Low stock threshold must be a non-negative number.",
        });
      }

      const variantGroups = parseVariantGroupsField(req.body.variantGroups);
      const variantTemplateKey =
        req.body.variantTemplateKey ||
        req.body.variantTemplate ||
        (variantGroups.length ? "custom" : null);

      // Parse vehicle details if provided
      let vehicleDetails = null;
      if (req.body.vehicleDetails) {
        try {
          const parsed = typeof req.body.vehicleDetails === 'string' 
            ? JSON.parse(req.body.vehicleDetails) 
            : req.body.vehicleDetails;
          
          // Clean and validate vehicle details
          if (parsed && typeof parsed === 'object') {
            // Validate ownerNumber (should be between 1-50)
            let ownerNumberValue = null;
            if (parsed.ownerNumber) {
              const ownerNum = Number(parsed.ownerNumber);
              if (!isNaN(ownerNum) && ownerNum >= 1 && ownerNum <= 50) {
                ownerNumberValue = ownerNum;
              } else {
                console.warn(`⚠️ Invalid ownerNumber value: ${parsed.ownerNumber}, setting to null`);
              }
            }

            // Validate seatingCapacity (should be between 1-50)
            let seatingCapacityValue = null;
            if (parsed.seatingCapacity) {
              const seatingCap = Number(parsed.seatingCapacity);
              if (!isNaN(seatingCap) && seatingCap >= 1 && seatingCap <= 50) {
                seatingCapacityValue = seatingCap;
              } else {
                console.warn(`⚠️ Invalid seatingCapacity value: ${parsed.seatingCapacity}, setting to null`);
              }
            }

            // Validate year (should be between 1900-2100)
            let yearValue = null;
            if (parsed.year) {
              const yearNum = Number(parsed.year);
              if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100) {
                yearValue = yearNum;
              } else {
                console.warn(`⚠️ Invalid year value: ${parsed.year}, setting to null`);
              }
            }

            // Validate registrationYear (should be between 1900-2100)
            let registrationYearValue = null;
            if (parsed.registrationYear) {
              const regYearNum = Number(parsed.registrationYear);
              if (!isNaN(regYearNum) && regYearNum >= 1900 && regYearNum <= 2100) {
                registrationYearValue = regYearNum;
              } else {
                console.warn(`⚠️ Invalid registrationYear value: ${parsed.registrationYear}, setting to null`);
              }
            }

            // Validate kmDriven (should be >= 0)
            let kmDrivenValue = null;
            if (parsed.kmDriven) {
              const kmNum = Number(parsed.kmDriven);
              if (!isNaN(kmNum) && kmNum >= 0) {
                kmDrivenValue = kmNum;
              } else {
                console.warn(`⚠️ Invalid kmDriven value: ${parsed.kmDriven}, setting to null`);
              }
            }

            vehicleDetails = {
              vehicleType: parsed.vehicleType || null,
              brand: parsed.brand || null,
              model: parsed.model || null,
              year: yearValue,
              mileage: parsed.mileage || null,
              fuelType: parsed.fuelType || null,
              transmission: parsed.transmission || null,
              color: parsed.color || null,
              engineCapacity: parsed.engineCapacity || null,
              seatingCapacity: seatingCapacityValue,
              registrationNumber: parsed.registrationNumber || null,
              registrationYear: registrationYearValue,
              ownerNumber: ownerNumberValue,
              condition: parsed.condition || null,
              kmDriven: kmDrivenValue,
              insuranceValidTill: parsed.insuranceValidTill ? new Date(parsed.insuranceValidTill) : null,
              rto: parsed.rto || null,
            };
          }
        } catch (err) {
          console.warn("⚠️ Failed to parse vehicle details:", err.message);
        }
      }
  
      // ✅ Create new product (auto-approved - status: "A")
      const newProduct = new Product({
        productName,
        companyName,
        mrp: parsedMrp,
        sellingPrice: parsedSellingPrice,
        information,
        qty: finalQtyValue,
        offPer,
        storeId,
        units: normalizedUnits.length ? normalizedUnits : undefined,
        details: parsedDetails,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        productImages,
        primaryImage: productImages[0] || "",
        categoryId: categoryParse.value,
        subCategoryId: subCategoryParse.value,
        stock: parsedStock,
        totalStock: parsedStock,
        lowStockThreshold: parsedLowStockThreshold,
        variantTemplate: variantTemplateKey,
        variantGroups,
        vehicleDetails: vehicleDetails,
        status: "A" // Auto-approved: products show immediately
      });
  
      const savedProduct = await newProduct.save();
      const responseProduct = applyPrimaryImageFallback(
        savedProduct.toObject ? savedProduct.toObject() : savedProduct
      );
  
      // ✅ Success response
      res.status(status.Create).json({
        status: jsonStatus.Create,
        success: true,
        message: "Product created successfully",
        data: responseProduct,
      });
    } catch (error) {
      console.error("❌ Error creating product:", error);
      res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: error.message,
      });
      return catchError("createProduct", error, req, res);
    }
  };
  

export const editProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = { ...req.body };

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const updateData = { updatedBy: req.user._id };
        let priceUpdatedViaUnits = false;

        if (Object.prototype.hasOwnProperty.call(payload, "details")) {
            const parsedDetails = parseDescriptionField(payload.details);
            updateData.details = parsedDetails;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "units")) {
            const parsedUnits = parseUnitsField(payload.units);
            if (parsedUnits.length === 0) {
                updateData.units = [];
            } else {
                const normalizedUnits = normalizeUnits(parsedUnits);
                if (!normalizedUnits.length) {
                    return res.status(status.BadRequest).json({
                        status: jsonStatus.BadRequest,
                        success: false,
                        message: "Invalid units provided. Please check qty, MRP and selling price."
                    });
                }
                updateData.units = normalizedUnits;
                priceUpdatedViaUnits = true;
                updateData.mrp = normalizedUnits[0].mrp;
                updateData.sellingPrice = normalizedUnits[0].sellingPrice;
                updateData.offPer = normalizedUnits[0].offPer;
                updateData.qty = normalizedUnits[0].qty || updateData.qty || product.qty;
            }
        }

        const additionalImages = mergeProductImages(
            parseProductImagesField(payload.productImages),
            extractProductImageKeys(req.files)
        );

        if (additionalImages.length) {
            const existingImages = Array.isArray(product.productImages) ? product.productImages : [];
            const mergedImages = mergeProductImages(existingImages, additionalImages);
            updateData.productImages = mergedImages;
            updateData.primaryImage = mergedImages[0] || product.primaryImage || "";
        }

        const simpleFields = ["productName", "companyName", "information", "qty", "status", "manufacturer"];
        simpleFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                updateData[field] = payload[field];
            }
        });

        // Parse and update vehicle details if provided
        if (Object.prototype.hasOwnProperty.call(payload, "vehicleDetails")) {
            try {
                const parsed = typeof payload.vehicleDetails === 'string' 
                    ? JSON.parse(payload.vehicleDetails) 
                    : payload.vehicleDetails;
                
                if (parsed && typeof parsed === 'object') {
                    // Validate ownerNumber (should be between 1-50)
                    let ownerNumberValue = null;
                    if (parsed.ownerNumber) {
                        const ownerNum = Number(parsed.ownerNumber);
                        if (!isNaN(ownerNum) && ownerNum >= 1 && ownerNum <= 50) {
                            ownerNumberValue = ownerNum;
                        } else {
                            console.warn(`⚠️ Invalid ownerNumber value: ${parsed.ownerNumber}, setting to null`);
                        }
                    }

                    // Validate seatingCapacity (should be between 1-50)
                    let seatingCapacityValue = null;
                    if (parsed.seatingCapacity) {
                        const seatingCap = Number(parsed.seatingCapacity);
                        if (!isNaN(seatingCap) && seatingCap >= 1 && seatingCap <= 50) {
                            seatingCapacityValue = seatingCap;
                        } else {
                            console.warn(`⚠️ Invalid seatingCapacity value: ${parsed.seatingCapacity}, setting to null`);
                        }
                    }

                    // Validate year (should be between 1900-2100)
                    let yearValue = null;
                    if (parsed.year) {
                        const yearNum = Number(parsed.year);
                        if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100) {
                            yearValue = yearNum;
                        } else {
                            console.warn(`⚠️ Invalid year value: ${parsed.year}, setting to null`);
                        }
                    }

                    // Validate registrationYear (should be between 1900-2100)
                    let registrationYearValue = null;
                    if (parsed.registrationYear) {
                        const regYearNum = Number(parsed.registrationYear);
                        if (!isNaN(regYearNum) && regYearNum >= 1900 && regYearNum <= 2100) {
                            registrationYearValue = regYearNum;
                        } else {
                            console.warn(`⚠️ Invalid registrationYear value: ${parsed.registrationYear}, setting to null`);
                        }
                    }

                    // Validate kmDriven (should be >= 0)
                    let kmDrivenValue = null;
                    if (parsed.kmDriven) {
                        const kmNum = Number(parsed.kmDriven);
                        if (!isNaN(kmNum) && kmNum >= 0) {
                            kmDrivenValue = kmNum;
                        } else {
                            console.warn(`⚠️ Invalid kmDriven value: ${parsed.kmDriven}, setting to null`);
                        }
                    }

                    updateData.vehicleDetails = {
                        vehicleType: parsed.vehicleType || null,
                        brand: parsed.brand || null,
                        model: parsed.model || null,
                        year: yearValue,
                        mileage: parsed.mileage || null,
                        fuelType: parsed.fuelType || null,
                        transmission: parsed.transmission || null,
                        color: parsed.color || null,
                        engineCapacity: parsed.engineCapacity || null,
                        seatingCapacity: seatingCapacityValue,
                        registrationNumber: parsed.registrationNumber || null,
                        registrationYear: registrationYearValue,
                        ownerNumber: ownerNumberValue,
                        condition: parsed.condition || null,
                        kmDriven: kmDrivenValue,
                        insuranceValidTill: parsed.insuranceValidTill ? new Date(parsed.insuranceValidTill) : null,
                        rto: parsed.rto || null,
                    };
                }
            } catch (err) {
                console.warn("⚠️ Failed to parse vehicle details:", err.message);
            }
        }

        if (Object.prototype.hasOwnProperty.call(payload, "storeId")) {
            const newStoreId = payload.storeId;
            const isStore = await Store.findOne({ createdBy: req.user._id, _id: newStoreId });
            if (!isStore) {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Store not found with this account" });
            }
            updateData.storeId = newStoreId;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "stock")) {
            const parsedStock = parseNonNegativeNumber(payload.stock);
            if (parsedStock === null) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "Stock must be a non-negative number."
                });
            }
            updateData.stock = parsedStock;
            updateData.totalStock = parsedStock;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "lowStockThreshold")) {
            const parsedThreshold = parseNonNegativeNumber(
                payload.lowStockThreshold,
                typeof product.lowStockThreshold === "number" ? product.lowStockThreshold : 5
            );
            if (parsedThreshold === null) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "Low stock threshold must be a non-negative number."
                });
            }
            updateData.lowStockThreshold = parsedThreshold;
        }

        if (Object.prototype.hasOwnProperty.call(payload, "variantGroups")) {
            updateData.variantGroups = parseVariantGroupsField(payload.variantGroups);
        }

        if (
            Object.prototype.hasOwnProperty.call(payload, "variantTemplateKey") ||
            Object.prototype.hasOwnProperty.call(payload, "variantTemplate")
        ) {
            updateData.variantTemplate = payload.variantTemplateKey || payload.variantTemplate || null;
        }

        if (
            Object.prototype.hasOwnProperty.call(payload, "category") ||
            Object.prototype.hasOwnProperty.call(payload, "categoryId")
        ) {
            const categoryParse = parseOptionalObjectId(payload.category || payload.categoryId);
            if (!categoryParse.valid) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "Invalid category selected."
                });
            }
            updateData.categoryId = categoryParse.value;
        }

        if (
            Object.prototype.hasOwnProperty.call(payload, "subcategory") ||
            Object.prototype.hasOwnProperty.call(payload, "subCategoryId")
        ) {
            const subCategoryParse = parseOptionalObjectId(payload.subcategory || payload.subCategoryId);
            if (!subCategoryParse.valid) {
                return res.status(status.BadRequest).json({
                    status: jsonStatus.BadRequest,
                    success: false,
                    message: "Invalid subcategory selected."
                });
            }
            updateData.subCategoryId = subCategoryParse.value;
        }

        const hasMrp = Object.prototype.hasOwnProperty.call(payload, "mrp");
        const hasSellingPrice = Object.prototype.hasOwnProperty.call(payload, "sellingPrice");

        if (!priceUpdatedViaUnits && (hasMrp || hasSellingPrice)) {
            const finalMrp = hasMrp ? Number(payload.mrp) : Number(product.mrp);
            const finalSellingPrice = hasSellingPrice ? Number(payload.sellingPrice) : Number(product.sellingPrice);

            if (isNaN(finalMrp) || isNaN(finalSellingPrice)) {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "MRP and Selling price must be valid numbers" });
            }

            const offPer = calculateDiscount(finalMrp, finalSellingPrice);
            if (offPer === "Invalid prices") {
                return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Something wrong with MRP or Selling price" });
            }

            updateData.mrp = finalMrp;
            updateData.sellingPrice = finalSellingPrice;
            updateData.offPer = offPer;
        }

        if (Object.keys(updateData).length === 1) { // only updatedBy present
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Please provide at least one field to update" });
        }

        const editProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        const formattedProduct = applyPrimaryImageFallback(
            editProduct?.toObject ? editProduct.toObject() : editProduct
        );

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: formattedProduct });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('editProduct', error, req, res);
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        await Product.findByIdAndUpdate(id, { deleted: true, updatedBy: req.user._id }, { new: true, runValidators: true });

        res.status(status.OK).json({ status: jsonStatus.OK, success: true });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProduct', error, req, res);
    }
};

export const productDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const productDetails = await Product.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "product_categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $lookup: {
                    from: "product_sub_categories",
                    localField: "subCategoryId",
                    foreignField: "_id",
                    as: "subCategory"
                }
            },
            {
                $addFields: {
                    category: { $arrayElemAt: ["$category", 0] },
                    subCategory: { $arrayElemAt: ["$subCategory", 0] }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: "createdBy",
                    foreignField: "createdBy",
                    as: "similarProducts",
                    pipeline: [
                        {
                            $match: {
                                _id: {
                                    $ne: new ObjectId(id)
                                }
                            }
                        },
                        {
                            $sort: {
                                createdAt: -1
                            }
                        }
                    ]
                }
            }
        ]);

        const detailWithImage = applyPrimaryImageFallback(productDetails[0]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: detailWithImage });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('productDetails', error, req, res);
    }
};

export const deleteProductImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { index } = req.body;

        if (typeof index !== "number" || index < 0) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Invalid index provided." });
        }

        const product = await Product.findOne({ _id: id, createdBy: req.user._id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        if (index >= product.productImages.length) {
            return res.status(status.BadRequest).json({ status: jsonStatus.BadRequest, success: false, message: "Index out of bounds." });
        }

        let updatedProduct = await Product.findByIdAndUpdate(
            id,
            {
                $pull: {
                    productImages: product.productImages[index]
                }
            },
            { new: true, runValidators: true }
        );

        if (updatedProduct) {
            const imagesArray = Array.isArray(updatedProduct.productImages) ? updatedProduct.productImages : [];
            const nextPrimary = imagesArray[0] || "";
            if (updatedProduct.primaryImage !== nextPrimary) {
                updatedProduct.primaryImage = nextPrimary;
                updatedProduct = await updatedProduct.save();
            }
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: applyPrimaryImageFallback(
                updatedProduct?.toObject ? updatedProduct.toObject() : updatedProduct
            )
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('deleteProductImage', error, req, res);
    }
};

export const productList = async (req, res) => {
    try {
      let { skip, search } = req.query;
      skip = skip || 1;
  
      const trimmedSearch = typeof search === "string" ? search.trim() : "";
  
      const matchQuery = {
        deleted: false,
        createdBy: new ObjectId(req.user._id),
      };
  
      // 🔍 LIVE SEARCH SUPPORT
      if (trimmedSearch) {
        const searchRegex = new RegExp(trimmedSearch, "i");
        matchQuery.$or = [
          { productName: { $regex: searchRegex } },
          { companyName: { $regex: searchRegex } },
          { information: { $regex: searchRegex } },
        ];
      }
  
      const list = await Product.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "product_categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category"
          }
        },
        {
          $lookup: {
            from: "product_sub_categories",
            localField: "subCategoryId",
            foreignField: "_id",
            as: "subCategory"
          }
        },
        {
          $addFields: {
            category: { $arrayElemAt: ["$category", 0] },
            subCategory: { $arrayElemAt: ["$subCategory", 0] }
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: (Number(skip) - 1) * limit },
        { $limit: limit },
      ]);
  
      // ❌ Remove 404 for live search (should return empty list)
      const listWithPrimaryImage = list.map((product) =>
        applyPrimaryImageFallback(product)
      );
  
      return res.status(status.OK).json({
        status: jsonStatus.OK,
        success: true,
        data: listWithPrimaryImage,
      });
    } catch (error) {
      res.status(status.InternalServerError).json({
        status: jsonStatus.InternalServerError,
        success: false,
        message: error.message,
      });
      return catchError("productList", error, req, res);
    }
  };

export const getLocalStoreHomePageData = async (req, res) => {
    try {

        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 8
            }
        ]);

        const stores = await Store.aggregate([
            {
                $match: {
                    status: "A"
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $addFields: {
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $project: {
                    productImages: 1,
                    category_name: 1,
                    name: 1,
                    address: 1
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 5
            }
        ]);

        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else {
            // If user location is not available, set distance and time to null for all stores
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { categories, stores } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getLocalStoreHomePageData', error, req, res);
    }
};

export const getLocalStoreHomePageDataV2 = async (req, res) => {
    try {
        const { lat, long, city } = req.body;
        const userDetails = await User.findById(req.user._id).select("lat long city state");

        const parsedLat = lat !== undefined && lat !== null && lat !== "" ? parseFloat(lat) : null;
        const parsedLong = long !== undefined && long !== null && long !== "" ? parseFloat(long) : null;

        let searchLat = Number.isFinite(parsedLat) ? parsedLat : null;
        let searchLong = Number.isFinite(parsedLong) ? parsedLong : null;

        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLong)) {
            // Update user location when a fresh coordinate is provided
            await User.findByIdAndUpdate(
                req.user._id,
                { lat: parsedLat, long: parsedLong },
                { new: true, runValidators: true }
            );
        } else if (userDetails?.lat && userDetails?.long) {
            const savedLat = parseFloat(userDetails.lat);
            const savedLong = parseFloat(userDetails.long);
            if (Number.isFinite(savedLat) && Number.isFinite(savedLong)) {
                searchLat = savedLat;
                searchLong = savedLong;
            }
        }

        const searchCity =
            (city && city.trim()) ||
            (userDetails?.city ? userDetails.city.trim() : "");

        // Fetch categories (unchanged from original code)
        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $limit: 8
            }
        ]);

        let stores = [];

        if (searchLat !== null && searchLong !== null) {
            // Fetch stores within 15 km radius
            stores = await Store.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [searchLong, searchLat] // Longitude first, then latitude
                        },
                        distanceField: "distance",
                        maxDistance: 15000, // 15 km in meters
                        spherical: true
                    }
                },
                {
                    $match: {
                        status: "A"
                    }
                },
                {
                    $lookup: {
                        from: "store_categories",
                        localField: "category",
                        foreignField: "_id",
                        as: "category_name"
                    }
                },
                {
                    $addFields: {
                        category_name: {
                            $ifNull: [
                                { $arrayElemAt: ["$category_name.name", 0] },
                                null
                            ]
                        }
                    }
                },
                {
                    $project: {
                        productImages: 1,
                        category_name: 1,
                        name: 1,
                        address: 1,
                        images: 1,
                        location: 1
                    }
                },
                {
                    $sort: {
                        createdAt: -1
                    }
                },
                {
                    $limit: 5
                }
            ]);
        } else if (searchCity) {
            const regex = new RegExp(searchCity, "i");
            stores = await Store.aggregate([
                {
                    $match: {
                        status: "A",
                        $or: [
                            { address: { $regex: regex } },
                            { "shiprocket.pickup_location.city": { $regex: regex } }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "store_categories",
                        localField: "category",
                        foreignField: "_id",
                        as: "category_name"
                    }
                },
                {
                    $addFields: {
                        category_name: {
                            $ifNull: [
                                { $arrayElemAt: ["$category_name.name", 0] },
                                null
                            ]
                        }
                    }
                },
                {
                    $project: {
                        productImages: 1,
                        category_name: 1,
                        name: 1,
                        address: 1,
                        images: 1,
                        location: 1
                    }
                },
                {
                    $sort: {
                        createdAt: -1
                    }
                },
                {
                    $limit: 8
                }
            ]);
        } else {
            // No coords or city: return a small default set of active stores to avoid empty UI
            stores = await Store.aggregate([
                { $match: { status: "A" } },
                {
                    $lookup: {
                        from: "store_categories",
                        localField: "category",
                        foreignField: "_id",
                        as: "category_name"
                    }
                },
                {
                    $addFields: {
                        category_name: {
                            $ifNull: [{ $arrayElemAt: ["$category_name.name", 0] }, null]
                        }
                    }
                },
                {
                    $project: {
                        productImages: 1,
                        category_name: 1,
                        name: 1,
                        address: 1,
                        images: 1,
                        location: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                { $limit: 8 }
            ]);
        }

        if (searchLat !== null && searchLong !== null) {
            const userLocation = { latitude: searchLat, longitude: searchLong };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else if (searchCity) {
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        } else {
            // Default list (no location): keep distance/time null
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        let totalCartCount = await Cart.find({ createdBy: req.user._id, deleted: false });
        if (totalCartCount.length > 0) {
            let total = 0;
            totalCartCount.map(elem => {
                total += elem.quantity;
            });
            totalCartCount = total;
        } else {
            totalCartCount = 0;
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: { categories, stores, totalCartCount } });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getLocalStoreHomePageDataV2', error, req, res);
    }
};

export const getAllCategories = async (req, res) => {
    try {

        const categories = await StoreCategory.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: categories });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getAllCategories', error, req, res);
    }
};

export const getAllStores = async (req, res) => {
    try {
        const { category, search, relevance, nearMe, offers } = req.query;
        const searchTerm = (typeof search === "string" ? search : "").trim();
        let { skip } = req.query;
        skip = skip || 1;
        const { lat, long } = req.user || {};

        let matchObj = {
            status: "A",
            ...(searchTerm && {
                name: {
                    $regex: searchTerm,
                    $options: 'i'
                }
            })
        };

        if (category) {
            matchObj = {
                ...matchObj,
                category: new ObjectId(category)
            };
        }

        const aggregationPipeline = [];

        if (nearMe === "1" && lat && long) {
            aggregationPipeline.unshift({
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [parseFloat(long), parseFloat(lat)]
                    },
                    distanceField: "distance",
                    maxDistance: 15000, // 15 km
                    spherical: true
                }
            });
        } else if (lat && long) {
            matchObj = {
                ...matchObj,
                location: {
                    $geoWithin: {
                        $centerSphere: [[parseFloat(long), parseFloat(lat)], 15000 / 6378.1]
                    }
                }
            };
        }

        aggregationPipeline.push(
            {
                $match: matchObj
            },
            {
                $lookup: {
                    from: "store_offers",
                    let: { storeId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$storeId", "$$storeId"] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "storeOffers"
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $addFields: {
                    storeOffersCount: { $size: "$storeOffers" },
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $project: {
                    productImages: 1,
                    category_name: 1,
                    name: 1,
                    address: 1,
                    storeOffersCount: 1,
                    images: 1,
                    location: 1
                }
            }
        );

        if (nearMe !== "1") {
            const sortStage = (offers === "1")
                ? { $sort: { storeOffersCount: -1, createdAt: -1 } }
                : { $sort: { createdAt: -1 } };

            aggregationPipeline.push(sortStage);
        }

        aggregationPipeline.push(
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            }
        );

        let stores = await Store.aggregate(aggregationPipeline);

        if (lat && long) {
            const userLocation = { latitude: parseFloat(lat), longitude: parseFloat(long) };
            const speedKmPerHour = 30; // Adjust for travel mode

            stores = stores.map(store => {
                if (store.location && store.location.coordinates) {
                    const storeLocation = {
                        latitude: store.location.coordinates[1],
                        longitude: store.location.coordinates[0]
                    };

                    const distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km
                    const estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes

                    return {
                        ...store,
                        distanceKm: Math.ceil(distance),
                        estimatedTimeMinutes: Math.ceil(estimatedTime)
                    };
                }
                return {
                    ...store,
                    distanceKm: null,
                    estimatedTimeMinutes: null
                };
            });
        } else {
            // If user location is not available, set distance and time to null for all stores
            stores = stores.map(store => ({
                ...store,
                distanceKm: null,
                estimatedTimeMinutes: null
            }));
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: stores });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getAllStores', error, req, res);
    }
};

export const getStoreDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user._id : null; // Assume userId is available in the request

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        let storeDetails = await Store.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: "store_categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category_name"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $addFields: {
                    category_name: {
                        $ifNull: [
                            { $arrayElemAt: ["$category_name.name", 0] },
                            null
                        ]
                    },
                    userDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$userDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: "store_offers",
                    localField: "_id",
                    foreignField: "storeId",
                    as: "storeOffers",
                    pipeline: [
                        {
                            $match: {
                                deleted: false
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: "store_popular_products",
                    localField: "_id",
                    foreignField: "storeId",
                    as: "popularProducts",
                    pipeline: [
                        {
                            $lookup: {
                                from: "products",
                                localField: "productId",
                                foreignField: "_id",
                                as: "productDetails",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "carts",
                                            let: { productId: "$_id" },
                                            pipeline: [
                                                {
                                                    $match: {
                                                        $expr: {
                                                            $and: [
                                                                { $eq: ["$productId", "$$productId"] },
                                                                { $eq: ["$createdBy", new ObjectId(userId)] },
                                                                { $eq: ["$deleted", false] }
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    $group: {
                                                        _id: "$productId",
                                                        totalQuantity: { $sum: "$quantity" }
                                                    }
                                                }
                                            ],
                                            as: "cartInfo"
                                        }
                                    },
                                    {
                                        $addFields: {
                                            cartQuantity: {
                                                $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                                            }
                                        }
                                    },
                                    {
                                        $project: { cartInfo: 0 } // Exclude cartInfo array from main product
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                productDetails: {
                                    $ifNull: [
                                        { $arrayElemAt: ["$productDetails", 0] },
                                        null
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        ]);

        let distance = null;
        let estimatedTime = null;

        if (userId) {
            const user = await User.findById(userId);
            if (user && user.lat && user.long) {
                const userLocation = {
                    latitude: parseFloat(user.lat),
                    longitude: parseFloat(user.long)
                };

                const storeLocation = {
                    latitude: store.location.coordinates[1],
                    longitude: store.location.coordinates[0]
                };

                distance = getDistance(userLocation, storeLocation) / 1000; // Convert to km

                const speedKmPerHour = 30; // Adjust based on travel mode (e.g., walking ~5 km/h, car ~30 km/h)
                estimatedTime = (distance / speedKmPerHour) * 60; // Convert to minutes
                distance = Math.ceil(distance);
                estimatedTime = Math.ceil(estimatedTime);
            }
        }

        let cartCount = 0;
        let carts = await Cart.find({ createdBy: req.user._id, deleted: false, storeId: id });
        if (carts.length > 0) {
            carts.map(elem => {
                cartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: { ...storeDetails[0], distanceKm: distance, estimatedTimeMinutes: estimatedTime, cartCount },
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getStoreDetails', error, req, res);
    }
};

export const getStoreProductList = async (req, res) => {
    try {

        const { id } = req.params;
        const { search } = req.query;
        let { skip } = req.query;
        skip = skip || 1;

        const store = await Store.findById(id);
        if (!store) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        const userId = req.user._id;

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false,
                    storeId: new ObjectId(id),
                    productName: {
                        $regex: search, $options: 'i'
                    }
                }
            },
            {
                $lookup: {
                    from: "carts",
                    let: { productId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$productId", "$$productId"] },
                                        { $eq: ["$createdBy", new ObjectId(userId)] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$productId",
                                totalQuantity: { $sum: "$quantity" }
                            }
                        }
                    ],
                    as: "cartInfo"
                }
            },
            {
                $addFields: {
                    cartQuantity: {
                        $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $skip: (Number(skip) - 1) * limit
            },
            {
                $limit: limit
            },
            {
                $project: {
                    cartInfo: 0 // Remove cartInfo field from final result
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getStoreProductList', error, req, res);
    }
};

export const getCategoryProductList = async (req, res) => {
    try {

        const { id } = req.params;

        const category = await StoreCategory.findById(id);
        if (!category) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: "Not Found" });
        }

        const list = await Product.aggregate([
            {
                $match: {
                    deleted: false
                }
            },
            {
                $lookup: {
                    from: "stores",
                    localField: "storeId",
                    foreignField: "_id",
                    as: "storeDetails"
                }
            },
            {
                $addFields: {
                    storeDetails: {
                        $ifNull: [
                            { $arrayElemAt: ["$storeDetails", 0] },
                            null
                        ]
                    }
                }
            },
            {
                $match: {
                    "storeDetails.category": new ObjectId(id)
                }
            },
            {
                $project: {
                    storeDetails: 0
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: list });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getCategoryProductList', error, req, res);
    }
};

export const getProductDetails = async (req, res) => {
    try {

        const { id } = req.params;

        const product = await Product.findOne({ _id: id });
        if (!product) {
            return res.status(status.NotFound).json({ status: jsonStatus.NotFound, success: false, message: `Product not found` });
        }

        const userId = req.user._id;

        const productDetails = await Product.aggregate([
            {
                $match: { _id: new ObjectId(id) }
            },
            {
                $lookup: {
                    from: "carts",
                    let: { productId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$productId", "$$productId"] },
                                        { $eq: ["$createdBy", new ObjectId(userId)] },
                                        { $eq: ["$deleted", false] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: "$productId",
                                totalQuantity: { $sum: "$quantity" }
                            }
                        }
                    ],
                    as: "cartInfo"
                }
            },
            {
                $addFields: {
                    cartQuantity: {
                        $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                    }
                }
            },
            {
                $lookup: {
                    from: "products",
                    let: { createdBy: "$createdBy", currentProductId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$createdBy", "$$createdBy"] },
                                        { $ne: ["$_id", "$$currentProductId"] }
                                    ]
                                }
                            }
                        },
                        {
                            $lookup: {
                                from: "carts",
                                let: { productId: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$productId", "$$productId"] },
                                                    { $eq: ["$createdBy", new ObjectId(userId)] },
                                                    { $eq: ["$deleted", false] }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $group: {
                                            _id: "$productId",
                                            totalQuantity: { $sum: "$quantity" }
                                        }
                                    }
                                ],
                                as: "cartInfo"
                            }
                        },
                        {
                            $addFields: {
                                cartQuantity: {
                                    $ifNull: [{ $arrayElemAt: ["$cartInfo.totalQuantity", 0] }, 0]
                                }
                            }
                        },
                        {
                            $sort: { createdAt: -1 }
                        },
                        {
                            $limit: 6
                        },
                        {
                            $project: { cartInfo: 0 } // Exclude cartInfo array
                        }
                    ],
                    as: "similarProducts"
                }
            },
            {
                $project: { cartInfo: 0 } // Exclude cartInfo array from main product
            }
        ]);

        let cartCount = 0;
        let carts = await Cart.find({ createdBy: req.user._id, deleted: false });
        if (carts.length > 0) {
            carts.map(elem => {
                cartCount += elem.quantity;
            })
        }

        res.status(status.OK).json({ status: jsonStatus.OK, success: true, data: productDetails, cartCount });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('getProductDetails', error, req, res);
    }
};