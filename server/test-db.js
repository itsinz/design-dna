require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Successfully connected to MongoDB!');
        
        // Create a test collection
        const testCollection = mongoose.connection.collection('test');
        
        // Insert a test document
        await testCollection.insertOne({ 
            test: true, 
            timestamp: new Date(),
            message: 'Database connection test successful!'
        });
        console.log('✅ Successfully wrote test data to database!');
        
        // Read the test document
        const result = await testCollection.findOne({ test: true });
        console.log('✅ Successfully read test data from database!');
        console.log('Test document:', result);
        
        // Clean up
        await testCollection.deleteOne({ test: true });
        console.log('✅ Successfully cleaned up test data!');
        
    } catch (error) {
        console.error('❌ Database connection error:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Connection closed.');
        process.exit(0);
    }
}

testConnection();
