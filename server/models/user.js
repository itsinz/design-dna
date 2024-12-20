const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    figmaId: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    handle: String,
    img_url: String,
    accessToken: {
        type: String,
        required: true,
        select: false // Don't include in normal queries
    },
    refreshToken: {
        type: String,
        select: false
    },
    recentFiles: [{
        fileKey: String,
        fileName: String,
        lastAccessed: {
            type: Date,
            default: Date.now
        },
        thumbnail: String
    }]
}, {
    timestamps: true
});

// Encrypt sensitive data before saving
userSchema.pre('save', function(next) {
    if (this.isModified('accessToken')) {
        this.accessToken = encryptData(this.accessToken);
    }
    if (this.isModified('refreshToken')) {
        this.refreshToken = encryptData(this.refreshToken);
    }
    next();
});

// Method to add a recent file
userSchema.methods.addRecentFile = async function(fileKey, fileName, thumbnail) {
    // Remove if exists
    this.recentFiles = this.recentFiles.filter(file => file.fileKey !== fileKey);
    
    // Add to front of array
    this.recentFiles.unshift({
        fileKey,
        fileName,
        thumbnail,
        lastAccessed: new Date()
    });

    // Keep only last 10 files
    this.recentFiles = this.recentFiles.slice(0, 10);
    
    return this.save();
};

// Helper method to get decrypted access token
userSchema.methods.getAccessToken = function() {
    return this.accessToken ? decryptData(this.accessToken) : null;
};

// Helper method to get decrypted refresh token
userSchema.methods.getRefreshToken = function() {
    return this.refreshToken ? decryptData(this.refreshToken) : null;
};

// Encryption helpers
function encryptData(text) {
    if (!text) return null;
    
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.CRYPTO_KEY || 'your-256-bit-secret', 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData) {
    if (!encryptedData) return null;
    
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.CRYPTO_KEY || 'your-256-bit-secret', 'hex');
    
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

const User = mongoose.model('User', userSchema);
module.exports = User;
