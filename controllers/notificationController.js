import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { jsonStatus, status } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";

const { ObjectId } = mongoose.Types;

const roleTargets = {
  user: ["user", "all"],
  retailer: ["retailer", "all"],
  deliveryboy: ["deliveryboy", "all"],
  seller: ["seller", "all"],
};

const normalizeRoleList = (roles) => {
  if (!roles) {
    return ["retailer"];
  }

  let roleArray = [];

  if (Array.isArray(roles)) {
    roleArray = roles;
  } else if (typeof roles === "string") {
    roleArray = roles.split(",");
  }

  roleArray = roleArray
    .map((role) => role && role.toString().trim().toLowerCase())
    .filter(Boolean);

  if (!roleArray.length) {
    return ["retailer"];
  }

  if (roleArray.includes("all")) {
    return ["user", "retailer", "seller", "deliveryboy"];
  }

  return roleArray;
};

const parseObjectIdArray = (payload) => {
  if (!payload) return [];

  let ids = [];
  if (Array.isArray(payload)) {
    ids = payload;
  } else if (typeof payload === "string") {
    ids = payload.split(",");
  }

  return ids
    .map((id) => id && id.toString().trim())
    .filter((id) => id && ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
};

const buildRoleNotificationFilter = (roleKey, userId) => {
  const allowedRoles = roleTargets[roleKey] || [roleKey];

  return {
    $and: [
      {
        $or: [
          { targetRoles: { $exists: false } },
          { targetRoles: { $size: 0 } },
          { targetRoles: { $in: allowedRoles } },
        ],
      },
      {
        $or: [
          { targetUserIds: { $exists: false } },
          { targetUserIds: { $size: 0 } },
          { targetUserIds: userId },
        ],
      },
      {
        $or: [
          { dismissedByUserIds: { $exists: false } },
          { dismissedByUserIds: { $size: 0 } },
          { dismissedByUserIds: { $nin: [userId] } },
        ],
      },
      {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
    ],
  };
};

const mapNotificationResponse = (notifications, userId) =>
  notifications.map((notification) => {
    const readBy = notification.readBy || [];
    const isRead = readBy.some(
      (entry) => entry.userId?.toString() === userId.toString()
    );
    return {
      ...notification,
      isRead,
    };
  });

const listNotificationsForRole = async (req, res, roleKey) => {
  try {
    const userId = new ObjectId(req.user._id);
    const filter = buildRoleNotificationFilter(roleKey, userId);

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const data = mapNotificationResponse(notifications, userId);

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError(`get${roleKey}Notifications`, error, req, res);
  }
};

const markNotificationReadForRole = (roleKey) => async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid notification id",
      });
    }

    const userId = new ObjectId(req.user._id);
    const filter = {
      _id: id,
      ...buildRoleNotificationFilter(roleKey, userId),
    };

    const notification = await Notification.findOne(filter);

    if (!notification) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Notification not found",
      });
    }

    const alreadyRead = (notification.readBy || []).some(
      (entry) => entry.userId?.toString() === userId.toString()
    );

    if (!alreadyRead) {
      notification.readBy.push({ userId, readAt: new Date() });
      await notification.save();
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError(`mark${roleKey}NotificationRead`, error, req, res);
  }
};

const clearNotificationsForRole = (roleKey) => async (req, res) => {
  try {
    const userId = new ObjectId(req.user._id);
    const filter = buildRoleNotificationFilter(roleKey, userId);

    const result = await Notification.updateMany(filter, {
      $addToSet: { dismissedByUserIds: userId },
    });

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Notifications cleared successfully",
      modified: result.modifiedCount,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError(`clear${roleKey}Notifications`, error, req, res);
  }
};

export const createNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type = "info",
      image,
      actionLabel,
      actionValue,
      actionType = "none",
      targetRoles,
      targetUserIds,
      retailerIds,
      expiresAt,
      meta,
    } = req.body;

    if (!title || !message) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Title and message are required",
      });
    }

    const notification = new Notification({
      title: title.trim(),
      message: message.trim(),
      type,
      image,
      action: {
        label: actionLabel,
        type: actionType,
        value: actionValue,
      },
      targetRoles: normalizeRoleList(targetRoles),
      targetUserIds: parseObjectIdArray(targetUserIds || retailerIds),
      meta: typeof meta === "object" && meta !== null ? meta : {},
      createdBy: req.user?._id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    await notification.save();

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Notification created successfully",
      data: notification,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("createNotification", error, req, res);
  }
};

export const listNotifications = async (req, res) => {
  try {
    const { role, search } = req.query;

    const filter = {};

    if (role) {
      filter.targetRoles = { $in: [role.toLowerCase(), "all"] };
    }

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: notifications,
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("listNotifications", error, req, res);
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Invalid notification id",
      });
    }

    const deleted = await Notification.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message,
    });
    return catchError("deleteNotification", error, req, res);
  }
};

export const getRetailerNotifications = (req, res) =>
  listNotificationsForRole(req, res, "retailer");
export const markRetailerNotificationRead = markNotificationReadForRole(
  "retailer"
);
export const clearRetailerNotifications = clearNotificationsForRole("retailer");

export const getUserNotifications = (req, res) =>
  listNotificationsForRole(req, res, "user");
export const markUserNotificationRead = markNotificationReadForRole("user");
export const clearUserNotifications = clearNotificationsForRole("user");

export const getDeliveryNotifications = (req, res) =>
  listNotificationsForRole(req, res, "deliveryboy");
export const markDeliveryNotificationRead =
  markNotificationReadForRole("deliveryboy");
export const clearDeliveryNotifications =
  clearNotificationsForRole("deliveryboy");

export const getSellerNotifications = (req, res) =>
  listNotificationsForRole(req, res, "seller");
export const markSellerNotificationRead = markNotificationReadForRole("seller");
export const clearSellerNotifications = clearNotificationsForRole("seller");

