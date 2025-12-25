import DonationSettings from '../models/DonationSettings.js';
import { errorResponse, successResponse } from '../helper/api.responses.js';

// Get donation settings
export const getDonationSettings = async (req, res) => {
  try {
    const settings = await DonationSettings.getSingleton();
    return res.status(200).json(
      successResponse({
        donationEnabled: settings.donationEnabled,
        donationOptions: settings.donationOptions,
        minDonationAmount: settings.minDonationAmount,
        maxDonationAmount: settings.maxDonationAmount,
        defaultDonationAmount: settings.defaultDonationAmount,
        donationLabel: settings.donationLabel,
        donationDescription: settings.donationDescription
      }, 'Donation settings retrieved successfully')
    );
  } catch (error) {
    console.error('Error getting donation settings:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Update donation settings (admin only)
export const updateDonationSettings = async (req, res) => {
  try {
    const {
      donationEnabled,
      donationOptions,
      minDonationAmount,
      maxDonationAmount,
      defaultDonationAmount,
      donationLabel,
      donationDescription
    } = req.body;

    const updatedSettings = await DonationSettings.updateSettings({
      donationEnabled,
      donationOptions,
      minDonationAmount,
      maxDonationAmount,
      defaultDonationAmount,
      donationLabel,
      donationDescription
    }, req.user._id);

    return res.status(200).json(
      successResponse({
        donationEnabled: updatedSettings.donationEnabled,
        donationOptions: updatedSettings.donationOptions,
        minDonationAmount: updatedSettings.minDonationAmount,
        maxDonationAmount: updatedSettings.maxDonationAmount,
        defaultDonationAmount: updatedSettings.defaultDonationAmount,
        donationLabel: updatedSettings.donationLabel,
        donationDescription: updatedSettings.donationDescription
      }, 'Donation settings updated successfully')
    );
  } catch (error) {
    console.error('Error updating donation settings:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};

// Validate donation amount
export const validateDonationAmount = async (amount) => {
  if (typeof amount !== 'number' || amount <= 0) {
    return { isValid: false, message: 'Donation amount must be a positive number' };
  }
  
  // Get donation settings to validate against configured min/max values
  const settings = await (await import('../models/DonationSettings.js')).default.getSingleton();
  
  if (amount < settings.minDonationAmount || amount > settings.maxDonationAmount) {
    return { 
      isValid: false, 
      message: `Donation amount must be between ₹${settings.minDonationAmount} and ₹${settings.maxDonationAmount}` 
    };
  }
  
  return { isValid: true, message: 'Valid donation amount' };
};

// Validate donation selection (predefined or custom)
export const validateDonationSelection = async (selectedDonation) => {
  if (typeof selectedDonation === 'number') {
    // This is a custom donation amount
    return validateDonationAmount(selectedDonation);
  } else if (typeof selectedDonation === 'string' && selectedDonation === 'other') {
    // This is just selecting the 'other' option, need to provide custom amount separately
    return { isValid: true, message: 'Valid donation option selection' };
  } else {
    // This should be a predefined amount from donation settings
    const settings = await (await import('../models/DonationSettings.js')).default.getSingleton();
    const validAmounts = settings.donationOptions
      .filter(option => option.amount !== 'other')
      .map(option => option.amount);
      
    if (validAmounts.includes(selectedDonation)) {
      return { isValid: true, message: 'Valid donation option selection' };
    } else {
      return { isValid: false, message: 'Invalid donation amount selected' };
    }
  }
};

// Validate custom donation amount (for the 'Other' option)
export const validateCustomDonationAmount = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (amount === undefined || amount === null) {
      return res.status(400).json(
        errorResponse('Donation amount is required')
      );
    }
    
    const validation = await validateDonationAmount(amount);
    
    if (!validation.isValid) {
      return res.status(400).json(
        errorResponse(validation.message)
      );
    }
    
    return res.status(200).json(
      successResponse({ amount }, 'Custom donation amount is valid')
    );
    
  } catch (error) {
    console.error('Error validating custom donation amount:', error);
    return res.status(500).json(
      errorResponse('Internal server error')
    );
  }
};