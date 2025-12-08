// Superadmin Controller - Reuses all admin functions for now
// This allows superadmin to have the same functionality as admin

import { jsonStatus, status } from '../helper/api.responses.js';
import { generateToken } from '../helper/generateToken.js';
import { catchError } from '../helper/service.js';
import Admin from '../models/Admin.js';
import bcrypt from 'bcrypt';

// Re-export all admin functions
// export * from './adminController.js';



export const createSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if superadmin already exists
    const exists = await Admin.findOne({ role: "superadmin" });

    if (exists) {
      return res.status(403).json({
        success: false,
        message: "Superadmin already exists! You cannot create another one.",
      });
    }

    // Create superadmin
    const superAdmin = await Admin.create({
      email,
      password,
      role: "superadmin",
    });

    res.status(201).json({
      success: true,
      message: "Superadmin created successfully",
      data: {
        id: superAdmin._id,
        email: superAdmin.email,
        role: superAdmin.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create superadmin",
    });
  }
};
// Separate login function for superadmin that checks role
export const loginSuperadmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Please enter credentials",
      });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid credentials (email not found)",
      });
    }

    // Check if admin has superadmin role
    if (admin.role !== "superadmin") {
      return res.status(status.Forbidden).json({
        status: jsonStatus.Forbidden,
        success: false,
        message: "Access Denied. Superadmin privileges required.",
      });
    }

    const checkPass = bcrypt.compareSync(password, admin.password);
    if (!checkPass) {
      return res.status(status.Unauthorized).json({
        status: jsonStatus.Unauthorized,
        success: false,
        message: "Invalid credentials (password mismatch)",
      });
    }

    const token = generateToken(admin._id);

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      token,
      role: admin.role,
    });
  } catch (error) {
    console.error("❌ loginSuperadmin error:", error.message);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("loginSuperadmin", error, req, res);
  }
};

