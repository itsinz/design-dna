const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Initialize Figma OAuth login
router.get('/figma', passport.authenticate('figma', {
    scope: ['files:read']
}));

// Handle Figma OAuth callback
router.get('/figma/callback',
    passport.authenticate('figma', { session: false }),
    (req, res) => {
        // Create JWT token
        const token = jwt.sign(
            { userId: req.user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Set to expire in 7 days
        );

        // Set JWT as HTTP-only cookie
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        });

        // Redirect to frontend with success
        res.redirect('/?login=success');
    }
);

// Logout route
router.get('/logout', (req, res) => {
    req.logout(() => {
        res.clearCookie('jwt');
        res.redirect('/');
    });
});

// Get current user info
router.get('/user', passport.authenticate('jwt', { session: false }), (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            handle: req.user.handle,
            img_url: req.user.img_url,
            recentFiles: req.user.recentFiles
        }
    });
});

module.exports = router;
