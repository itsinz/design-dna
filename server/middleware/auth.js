const jwt = require('jsonwebtoken');
const User = require('../models/user');
const axios = require('axios');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('+accessToken +refreshToken');
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware to refresh Figma access token if needed
const refreshFigmaToken = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Test current token
        try {
            await axios.get('https://api.figma.com/v1/me', {
                headers: { 'Authorization': `Bearer ${req.user.getAccessToken()}` }
            });
            return next(); // Token is still valid
        } catch (error) {
            if (error.response?.status !== 401) {
                throw error; // Unexpected error
            }
        }

        // Token expired, try to refresh
        const refreshToken = req.user.getRefreshToken();
        if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token available' });
        }

        const response = await axios.post('https://www.figma.com/api/oauth/refresh', {
            client_id: process.env.FIGMA_CLIENT_ID,
            client_secret: process.env.FIGMA_CLIENT_SECRET,
            refresh_token: refreshToken
        });

        // Update tokens
        req.user.accessToken = response.data.access_token;
        if (response.data.refresh_token) {
            req.user.refreshToken = response.data.refresh_token;
        }
        await req.user.save();

        next();
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
};

module.exports = {
    isAuthenticated,
    verifyToken,
    refreshFigmaToken
};
