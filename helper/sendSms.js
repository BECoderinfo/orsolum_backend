import axios from "axios";

const SMS_API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SENDER_ID;
const TEMPLATE_ID = process.env.TEMPLATE_ID;

export const sendSms = async (mobileNumber, templateParams) => {
    try {
        console.log('mobileNumber, templateParams', mobileNumber, templateParams)
        const response = await axios.post(
            "https://api.msg91.com/api/v5/flow/",
            {
                flow_id: TEMPLATE_ID, // Airtel Template ID (Flow ID)
                sender: SENDER_ID, // Ex: 'TXTLCL' (MSG91 approved sender ID)
                recipients: [
                    {
                        mobiles: mobileNumber,
                        var1: templateParams.var1,
                        var2: templateParams.var2,
                    },
                ],
            },
            {
                headers: {
                    authkey: SMS_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log("SMS sent successfully:", response.data);
        return true;
    } catch (error) {
        console.error(
            "Error sending SMS:",
            error.response ? error.response.data : error.message
        );
        return false;
    }
};
