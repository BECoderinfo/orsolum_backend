import jwt from 'jsonwebtoken';

export const generateToken = (id) => {
    const token = jwt.sign({ _id: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
    return `Bearer ${token}`;
};