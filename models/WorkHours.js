import mongoose from "mongoose";

const workHoursSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Full time", "Part time"],
      required: true,
    },
    earnMin: { type: Number, required: true },
    earnMax: { type: Number, required: true },
    hoursPerDayMin: { type: Number, required: true },
    hoursPerDayMax: { type: Number, required: true },
    daysPerWeek: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("WorkHours", workHoursSchema);
