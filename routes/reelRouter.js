import express from "express";
import { body } from 'express-validator';
import { userAuthentication, adminAuthentication } from "../middlewares/middleware.js";
import { uploadReelAssetsV1, createReel, getReels, likeReel, unlikeReel, saveReel, unsaveReel, updateReel, getSavedReels, getReelById, deleteReel, reelList } from "../controllers/reelsController.js";
import { uploadReelFiles } from "../helper/uploadImage.js";
const reelRouter = express.Router();

reelRouter.post('/admin/upload/reel/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadReelAssetsV1);

// admin
reelRouter.post("/create/reel/v1", adminAuthentication, uploadReelFiles.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), createReel);
reelRouter.put("/update/reels/:id/v1", adminAuthentication, uploadReelFiles.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), updateReel);
reelRouter.delete("/delete/reels/:id/v1", adminAuthentication, deleteReel);
reelRouter.get("/admin/reels/list/v1", adminAuthentication, reelList);

// user
reelRouter.get("/reels/list/v1", userAuthentication, getReels);
reelRouter.get("/saved/reels/list/v1", userAuthentication, getSavedReels);
reelRouter.get("/reels/details/:id/v1", userAuthentication, getReelById);
reelRouter.post("/like/reels/:id/v1", userAuthentication, likeReel);
reelRouter.post("/unlike/reels/:id/v1", userAuthentication, unlikeReel);
reelRouter.post("/save/reels/:id/v1", userAuthentication, saveReel);
reelRouter.post("/unsave/reels/:id/v1", userAuthentication, unsaveReel);

export default reelRouter;
