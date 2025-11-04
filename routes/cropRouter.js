import express from "express";
import { body } from 'express-validator';
import { userAuthentication, adminAuthentication } from "../middlewares/middleware.js";
import { createCrop, uploadCropImage, getAllCrops, deleteCrop, createUserCrop, userCropDetails, uploadArticleImage, createArticle, homePageData, allArticles, getWeatherDetails, createFarm, updateFarm, farmList, detailsFarm, createKrishiCard, getKrishiCard, updateKrishiCard, getKrishiCardById, deleteArticle, getOneArticle, getArticleList, updateArticle } from "../controllers/cropController.js";
const cropRouter = express.Router();

// Upload crop image
cropRouter.post('/admin/upload/crop/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadCropImage);
cropRouter.post('/admin/upload/article/v1', [
    body('sFileName').not().isEmpty(),
    body('sContentType').not().isEmpty()
], adminAuthentication, uploadArticleImage);

// admin
cropRouter.post("/admin/crop/v1", adminAuthentication, createCrop);
cropRouter.get("/admin/crops/v1", adminAuthentication, getAllCrops);
cropRouter.delete("/admin/crop/:id/v1", adminAuthentication, deleteCrop);
cropRouter.post("/admin/create/article/v1", adminAuthentication, createArticle);
cropRouter.delete("/admin/delete/article/:id/v1", adminAuthentication, deleteArticle);
cropRouter.get("/admin/get/article/:id/v1", adminAuthentication, getOneArticle);
cropRouter.get("/admin/get/articles/v1", adminAuthentication, getArticleList);
cropRouter.put("/admin/update/article/:id/v1", adminAuthentication, updateArticle);
// user
cropRouter.get("/user/crops/v1", userAuthentication, getAllCrops);

// user crop
cropRouter.get("/user/crop/home/page/v1", userAuthentication, homePageData);
cropRouter.get("/user/all/articles/v1", userAuthentication, allArticles);
cropRouter.get("/user/crop/details/v1", userAuthentication, userCropDetails);
cropRouter.post("/user/create/crop/v1", userAuthentication, createUserCrop);

// weather
cropRouter.get("/weather/details/:lat/:long/v1", userAuthentication, getWeatherDetails);

// farm
cropRouter.post("/create/farm/v1", userAuthentication, createFarm);
cropRouter.put("/update/farm/:id/v1", userAuthentication, updateFarm);
cropRouter.get("/list/farm/v1", userAuthentication, farmList);
cropRouter.get("/details/farm/:id/v1", userAuthentication, detailsFarm);

// krishi card
cropRouter.post("/create/krishi/card/v1", userAuthentication, createKrishiCard);
cropRouter.put("/update/krishi/card/v1", userAuthentication, updateKrishiCard);
cropRouter.get("/krishi/card/v1", userAuthentication, getKrishiCard);

// public
cropRouter.get("/krishi/card/:id/v1", getKrishiCardById);

export default cropRouter;