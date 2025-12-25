import mongoose from "mongoose";

export const dbConnect = async () => {
    try {
        // Connect with improved options for resilience
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 30000,  // 30 seconds timeout for server selection
            socketTimeoutMS: 45000,          // 45 seconds timeout for socket operations
            maxPoolSize: 10,                // Maintain up to 10 socket connections
            serverMonitoringMode: 'auto',   // Auto-select the best monitoring mode
            heartbeatFrequencyMS: 10000,    // How often to check if connection is still alive
            retryWrites: true,              // Enable retryable writes
            autoIndex: false,               // Disable auto-indexing in production
            maxConnecting: 5,               // Maximum number of connections attempting to be opened
        });

        console.log("✅ MongoDB Connected Successfully");

        // Add connection event handlers
        mongoose.connection.on('error', (err) => {
            console.error('🔴 MongoDB Connection Error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB Disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB Reconnected');
        });

        // Graceful shutdown handling
        process.on('SIGINT', async () => {
            console.log('\n⚠️  shutting down gracefully...');
            await mongoose.connection.close();
            console.log('MongoDB connection closed through app termination');
            process.exit(0);
        });

    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        console.error("⚠️ Server continuing without database connection - please check your MongoDB connection");
        // Don't exit the process - just log the error
        // This allows the server to continue running and potentially recover
    }
};