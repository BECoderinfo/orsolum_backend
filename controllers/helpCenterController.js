import HelpCenterTicket from "../models/HelpCenterTicket.js";
import Store from "../models/Store.js";
import { status, jsonStatus } from "../helper/api.responses.js";
import { catchError } from "../helper/service.js";

const sanitizeAttachments = (attachments) => {
  if (!attachments) return [];
  if (Array.isArray(attachments)) {
    return attachments
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof attachments === "string") {
    return attachments
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const buildSearchQuery = (search) => {
  if (!search) return null;
  const regex = new RegExp(search, "i");
  return {
    $or: [
      { ticketId: regex },
      { subject: regex },
      { orderNumber: regex },
      { productName: regex },
      { description: regex },
    ],
  };
};

const buildSummary = (tickets = []) => {
  const summary = {
    total: tickets.length,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    priority: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };

  tickets.forEach((ticket) => {
    if (summary[ticket.status] !== undefined) {
      summary[ticket.status] += 1;
    }
    if (summary.priority[ticket.priority] !== undefined) {
      summary.priority[ticket.priority] += 1;
    }
  });

  return summary;
};

export const createHelpCenterTicket = async (req, res) => {
  try {
    const { subject, description, issueType, orderNumber, productName } = req.body;

    if (!subject || !description) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Subject and description are required",
      });
    }

    const store = await Store.findOne({ createdBy: req.user._id });
    if (!store) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Store not found. Please create your store first.",
      });
    }

    const attachments = sanitizeAttachments(req.body.attachments);
    const lossAmount = Number(req.body.lossAmount) || 0;

    const ticket = await HelpCenterTicket.create({
      sellerId: req.user._id,
      storeId: store._id,
      orderId: req.body.orderId || null,
      orderNumber: orderNumber?.trim() || "",
      productName: productName?.trim() || "",
      issueType: issueType || "other",
      subject: subject.trim(),
      description: description.trim(),
      lossAmount,
      attachments,
      priority: req.body.priority || "medium",
    });

    return res.status(status.Create).json({
      status: jsonStatus.Create,
      success: true,
      message: "Support ticket raised successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("createHelpCenterTicket Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to raise ticket",
    });
    return catchError("createHelpCenterTicket", error, req, res);
  }
};

export const getSellerHelpTickets = async (req, res) => {
  try {
    const tickets = await HelpCenterTicket.find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: tickets,
    });
  } catch (error) {
    console.error("getSellerHelpTickets Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to fetch tickets",
    });
    return catchError("getSellerHelpTickets", error, req, res);
  }
};

export const adminListHelpCenterTickets = async (req, res) => {
  try {
    const { status: statusFilter, priority, search } = req.query;

    const query = {};
    if (statusFilter && statusFilter !== "all") {
      query.status = statusFilter;
    }
    if (priority) {
      query.priority = priority;
    }
    const searchQuery = buildSearchQuery(search);
    if (searchQuery) {
      Object.assign(query, searchQuery);
    }

    const tickets = await HelpCenterTicket.find(query)
      .populate("sellerId", "name phone email")
      .populate("storeId", "name phone address")
      .sort({ createdAt: -1 })
      .lean();

    const summary = buildSummary(tickets);

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      data: {
        tickets,
        summary,
      },
    });
  } catch (error) {
    console.error("adminListHelpCenterTickets Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to fetch help center tickets",
    });
    return catchError("adminListHelpCenterTickets", error, req, res);
  }
};

export const adminUpdateHelpCenterTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status: newStatus, priority, adminMessage, lossAmount } = req.body;

    const ticket = await HelpCenterTicket.findById(ticketId);
    if (!ticket) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ticket not found",
      });
    }

    if (newStatus) {
      ticket.status = newStatus;
    }

    if (priority) {
      ticket.priority = priority;
    }

    if (lossAmount !== undefined && lossAmount !== null && lossAmount !== "") {
      const parsedLoss = Number(lossAmount);
      if (!Number.isNaN(parsedLoss)) {
        ticket.lossAmount = parsedLoss;
      }
    }

    if (adminMessage && adminMessage.trim()) {
      ticket.updates.push({
        message: adminMessage.trim(),
        addedBy: "admin",
        createdAt: new Date(),
      });
    }

    await ticket.save();

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ticket updated successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("adminUpdateHelpCenterTicket Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to update ticket",
    });
    return catchError("adminUpdateHelpCenterTicket", error, req, res);
  }
};

export const adminDeleteHelpCenterTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (!ticketId) {
      return res.status(status.BadRequest).json({
        status: jsonStatus.BadRequest,
        success: false,
        message: "Ticket id is required",
      });
    }

    const ticket = await HelpCenterTicket.findByIdAndDelete(ticketId);
    if (!ticket) {
      return res.status(status.NotFound).json({
        status: jsonStatus.NotFound,
        success: false,
        message: "Ticket not found",
      });
    }

    return res.status(status.OK).json({
      status: jsonStatus.OK,
      success: true,
      message: "Ticket deleted successfully",
    });
  } catch (error) {
    console.error("adminDeleteHelpCenterTicket Error:", error);
    res.status(status.InternalServerError).json({
      status: jsonStatus.InternalServerError,
      success: false,
      message: error.message || "Failed to delete ticket",
    });
    return catchError("adminDeleteHelpCenterTicket", error, req, res);
  }
};

