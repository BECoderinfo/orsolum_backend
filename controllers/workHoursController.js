import { jsonStatus, status } from '../helper/api.responses.js';
import { catchError } from '../helper/service.js';
import WorkHours from "../models/WorkHours.js";


export const createWorkHours = async (req, res) => {
    try {
        const { type, earnMin, earnMax, hoursPerDayMin, hoursPerDayMax, daysPerWeek } = req.body;

        if (!type || !earnMin || !earnMax || !hoursPerDayMin || !hoursPerDayMax || !daysPerWeek) {
            return res.status(status.BadRequest).json({
                status: jsonStatus.BadRequest,
                success: false,
                message: "All fields are required",
            });
        }

        const workHours = new WorkHours({ type, earnMin, earnMax, hoursPerDayMin, hoursPerDayMax, daysPerWeek });
        await workHours.save();

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            data: workHours,
        });
    } catch (error) {
        res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('isExist', error, req, res);
    }
}

export const getAllWorkHours = async (req, res) => {
    try {
        const workHours = await WorkHours.find().select('-__v -createdAt -updatedAt');
        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Work hours list fetched successfully",
            data: workHours,
        });
    } catch (error) {
           res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('isExist', error, req, res);
    }
};

export const updateWorkHours = async (req, res) => {
    try {
        const updated = await WorkHours.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).select("-__v -createdAt -updatedAt");

        if (!updated) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: "Work hours not found with given id"
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Work hours updated successfully",
            data: updated,
        });
    } catch (error) {
        res.status(status.InternalServerError).json({
            status: jsonStatus.InternalServerError,
            success: false,
            message: error.message
        });
        return catchError("updateWorkHours", error, req, res);
    }
};

export const deleteWorkHours = async (req, res) => {
    try {
        const deleted = await WorkHours.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(status.NotFound).json({
                status: jsonStatus.NotFound,
                success: false,
                message: `Work hours not found with given id`,
            });
        }

        res.status(status.OK).json({
            status: jsonStatus.OK,
            success: true,
            message: "Work hours deleted successfully",
        });
    } catch (error) {
          res.status(status.InternalServerError).json({ status: jsonStatus.InternalServerError, success: false, message: error.message });
        return catchError('isExist', error, req, res);
    }
};
