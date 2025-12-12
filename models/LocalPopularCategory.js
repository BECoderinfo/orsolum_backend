import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const LocalPopularCategorySchema = new mongoose.Schema(
  {
    createdBy: {
      type: ObjectId,
      ref: "admin",
      required: true,
    },
    updatedBy: {
      type: ObjectId,
      ref: "admin",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    storeCategoryId: {
      type: ObjectId,
      ref: "store_category",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const LocalPopularCategory = mongoose.model(
  "local_popular_category",
  LocalPopularCategorySchema
);

export default LocalPopularCategory;

