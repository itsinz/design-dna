const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const axios = require('axios');
const User = require('../models/user');

// JWT options
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        req => req.cookies?.jwt // Also check cookies for JWT
    ]),
    secretOrKey: process.env.JWT_SECRET
};

// JWT strategy
passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
        const user = await User.findById(payload.userId);
        if (user) {
            return done(null, user);
        }
        return done(null, false);
    } catch (error) {
        return done(error, false);
    }
}));

// Figma OAuth2 configuration
const figmaStrategy = new OAuth2Strategy({
    authorizationURL: 'https://www.figma.com/oauth',
    tokenURL: 'https://www.figma.com/api/oauth/token',
    clientID: process.env.FIGMA_CLIENT_ID,
    clientSecret: process.env.FIGMA_CLIENT_SECRET,
    callbackURL: process.env.FIGMA_OAUTH_CALLBACK_URL || 'http://localhost:3001/auth/figma/callback',
    state: true
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Fetch user profile from Figma API
        const response = await axios.get('https://api.figma.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const figmaProfile = response.data;

        // Find or create user
        let user = await User.findOne({ figmaId: figmaProfile.id });

        if (!user) {
            user = new User({
                figmaId: figmaProfile.id,
                email: figmaProfile.email,
                handle: figmaProfile.handle,
                img_url: figmaProfile.img_url
            });
        }

        // Update tokens
        user.accessToken = accessToken;
        if (refreshToken) {
            user.refreshToken = refreshToken;
        }

        await user.save();
        return done(null, user);

    } catch (error) {
        return done(error);
    }
});

passport.use('figma', figmaStrategy);

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

module.exports = passport;
