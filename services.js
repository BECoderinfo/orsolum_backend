import { checkAdsExpiryAndNotify } from './controllers/adController.js';
import User from './models/User.js';

export const checkPremiumExpiry = async () => {
  try {
    const currentDate = new Date();

    // Find users whose premium has expired
    const expiredUsers = await User.find({
      isPremium: true,
      expiryDate: { $lte: currentDate }
    });

    if (expiredUsers.length > 0) {
      // Update all expired users
      await User.updateMany(
        { isPremium: true, expiryDate: { $lte: currentDate } },
        { isPremium: false }
      );

      console.log(`Updated ${expiredUsers.length} users: Premium expired.`);
    } else {
      console.log("No expired premium users found.");
    }
  } catch (error) {
    console.error("Error checking premium expiry:", error);
  }
};

export const runAdsExpiryCron = async () => {
  try {
    await checkAdsExpiryAndNotify();
  } catch (error) {
    console.error("Error running ads expiry cron:", error);
  }
};