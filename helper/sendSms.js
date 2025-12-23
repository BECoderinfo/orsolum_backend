import axios from "axios";

const SMS_API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SENDER_ID;
const TEMPLATE_ID = process.env.TEMPLATE_ID;

export const sendSms = async (mobileNumber, templateParams) => {
    try {
        console.log("Mobile Number:", mobileNumber);
        console.log("Template Params:", templateParams);

        const payload = {
            flow_id: TEMPLATE_ID,   // MSG91 Flow ID
            sender: SENDER_ID,      // 6-character approved sender ID
            recipients: [
                {
                    mobiles: mobileNumber,   // +91xxxxxxxxxx or xxxxxxxxxx
                    var1: templateParams.var1,  // user name
                    var2: templateParams.var2,  // OTP
                    var3: templateParams.appHash || '',  // App hash for auto-fill
                },
            ],
        };

        // Add timeout of 10 seconds to prevent hanging
        const response = await axios.post(
            "https://api.msg91.com/api/v5/flow/",
            payload,
            {
                headers: {
                    authkey: SMS_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout: 10000, // 10 seconds timeout
            }
        );

        console.log("SMS sent successfully:", response.data);
        return true;

    } catch (error) {
        console.error(
            "Error sending SMS:",
            error.response ? error.response.data : error.message
        );
        // Return false but don't throw error - let the calling function handle it
        return false;
    }
};
