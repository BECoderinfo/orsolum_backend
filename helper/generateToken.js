import jwt from 'jsonwebtoken';

export const generateToken = (id) => {
    const token = jwt.sign({ _id: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
    return token; // Return token without Bearer prefix - middleware will handle it
};