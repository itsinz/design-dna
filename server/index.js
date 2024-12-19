require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Figma API configuration
const FIGMA_API_BASE_URL = 'https://api.figma.com/v1';
const figmaApi = axios.create({
    baseURL: FIGMA_API_BASE_URL,
    headers: {
        'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN
    }
});

// Utility function to analyze colors
const analyzeColors = (node, colors = new Set()) => {
    if (node.fills) {
        node.fills.forEach(fill => {
            if (fill.type === 'SOLID' && fill.color) {
                const rgba = `rgba(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)}, ${fill.opacity || 1})`;
                colors.add(rgba);
            }
        });
    }
    if (node.children) {
        node.children.forEach(child => analyzeColors(child, colors));
    }
    return Array.from(colors);
};

// Utility function to analyze typography
const analyzeTypography = (node, typography = {}) => {
    if (node.style) {
        const style = `${node.style.fontFamily || 'Unknown'} ${node.style.fontWeight || ''} ${node.style.fontSize || ''}px`;
        typography[style] = (typography[style] || 0) + 1;
    }
    if (node.children) {
        node.children.forEach(child => analyzeTypography(child, typography));
    }
    return typography;
};

// Enhanced layer complexity analysis
const analyzeLayerComplexity = (node, stats = { 
    total: 0, 
    components: {}, 
    complexFrames: [],
    layerTypes: {},
    maxDepth: 0,
    currentDepth: 0
}) => {
    stats.total++;
    stats.currentDepth++;
    stats.maxDepth = Math.max(stats.maxDepth, stats.currentDepth);
    
    // Track layer types
    stats.layerTypes[node.type] = (stats.layerTypes[node.type] || 0) + 1;
    
    // Track component usage
    if (node.type === 'COMPONENT') {
        stats.components[node.name] = (stats.components[node.name] || 0) + 1;
    }
    
    // Track complex frames
    if (node.type === 'FRAME' && node.children && node.children.length > 10) {
        stats.complexFrames.push({
            name: node.name,
            childCount: node.children.length,
            width: node.absoluteBoundingBox?.width,
            height: node.absoluteBoundingBox?.height
        });
    }
    
    // Recursively analyze children
    if (node.children) {
        node.children.forEach(child => {
            stats.currentDepth++;
            analyzeLayerComplexity(child, stats);
            stats.currentDepth--;
        });
    }
    
    return stats;
};

// Utility function to extract file key from Figma URL
const extractFileKey = (url) => {
    const patterns = [
        /figma.com\/file\/([a-zA-Z0-9]+)/,
        /figma.com\/proto\/([a-zA-Z0-9]+)/,
        /figma.com\/design\/([a-zA-Z0-9]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return url; // Return as is if it's already a file key
};

// Color analysis utilities
const analyzeColorHarmony = (colors) => {
    const hslColors = colors.map(color => {
        const rgba = color.match(/\d+/g).map(Number);
        return rgbToHsl(rgba[0], rgba[1], rgba[2]);
    });

    // Check for monochromatic (similar hues)
    const hueRange = Math.max(...hslColors.map(hsl => hsl.h)) - Math.min(...hslColors.map(hsl => hsl.h));
    const isMonochromatic = hueRange < 30;

    // Check for high contrast
    const lightness = hslColors.map(hsl => hsl.l);
    const hasHighContrast = Math.max(...lightness) - Math.min(...lightness) > 0.5;

    // Check for vibrant colors
    const avgSaturation = hslColors.reduce((sum, hsl) => sum + hsl.s, 0) / hslColors.length;
    const isVibrant = avgSaturation > 0.6;

    return {
        isMonochromatic,
        hasHighContrast,
        isVibrant,
        avgSaturation: avgSaturation * 100
    };
};

const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
};

// Updated archetypes with more distinct characteristics
const DESIGN_ARCHETYPES = {
    "The Minimalist Monk": {
        description: "You're the Marie Kondo of UI design! Your designs spark joy through their beautiful simplicity. Every element in your work has earned its place, like a carefully curated zen garden. 🧘‍♂️",
        strengths: ["Ruthless simplification", "Pixel-perfect spacing", "Elegant minimalism"],
        compatibility: {
            archetype: "The Color Mystic",
            reason: "While you master the art of less, the Color Mystic adds just the right amount of soul-stirring vibrancy to your zen masterpieces!"
        },
        emoji: "✨",
        requirements: {
            maxLayers: 500,
            maxColors: 4,
            maxTypography: 3,
            needsMonochromatic: true
        }
    },
    "The Color Mystic": {
        description: "You're the mood ring of the design world! Your color choices don't just look good - they tell stories, evoke emotions, and probably make people cry (in a good way). You're not picking colors, you're crafting experiences! 🌈",
        strengths: ["Emotional color theory", "Visual storytelling", "Brand personality"],
        compatibility: {
            archetype: "The Grid Guardian",
            reason: "Your expressive color mastery combined with a Grid Guardian's structure creates designs that are both emotionally powerful and perfectly balanced!"
        },
        emoji: "🎨",
        requirements: {
            minColors: 6,
            needsVibrant: true,
            needsHighContrast: true
        }
    },
    "The Grid Guardian": {
        description: "You're the architect of the pixel realm! Your grids are so perfect they make mathematicians weep. You don't just design layouts - you conduct symphonies of structure where every element plays its perfect part. 📐",
        strengths: ["Layout mastery", "Responsive design", "Structural harmony"],
        compatibility: {
            archetype: "The Type Whisperer",
            reason: "Your pristine layouts provide the perfect stage for a Type Whisperer's typographic performances!"
        },
        emoji: "📏",
        requirements: {
            needsSymmetry: true,
            maxDepth: 5,
            needsConsistentSpacing: true
        }
    },
    "The Type Whisperer": {
        description: "You're the Shakespeare of the screen! Typography isn't just text in your hands - it's a performance art. You can hear fonts speak and make them sing in perfect harmony. Your kerning game is so strong, it should be illegal! 🎭",
        strengths: ["Typography mastery", "Font pairing", "Readability magic"],
        compatibility: {
            archetype: "The Pixel Prophet",
            reason: "While you craft the perfect reading experience, the Pixel Prophet ensures every detail supports your typographic symphony!"
        },
        emoji: "📚",
        requirements: {
            minTypographyStyles: 5,
            needsConsistentTypeScale: true,
            needsReadabilityFocus: true
        }
    },
    "The Pixel Prophet": {
        description: "You see the future in every pixel! Like a design fortune-teller, you craft interfaces that feel like they're from tomorrow. Your micro-interactions are so smooth, they make butter jealous. You don't follow trends - you start them! 🔮",
        strengths: ["Innovation", "Micro-interactions", "Future-forward design"],
        compatibility: {
            archetype: "The Component Composer",
            reason: "Your innovative spirit paired with a Component Composer's systematic approach creates interfaces that are both revolutionary and reliable!"
        },
        emoji: "✨",
        requirements: {
            needsInnovation: true,
            minInteractions: 10,
            needsUniqueness: true
        }
    },
    "The Component Composer": {
        description: "You're the LEGO master of UI! Your components are so well-organized, Marie Kondo would hire you. You don't just build systems - you compose design symphonies where every piece plays perfectly with others. Your variants game is stronger than a coffee shop's menu! ⚡",
        strengths: ["System thinking", "Component architecture", "Scalable design"],
        compatibility: {
            archetype: "The Minimalist Monk",
            reason: "Your systematic brilliance combined with a Minimalist Monk's clarity creates designs that are both powerful and pristine!"
        },
        emoji: "🏗️",
        requirements: {
            minComponents: 15,
            needsConsistency: true,
            needsSystematic: true
        }
    }
};

// Enhanced personality analysis with more distinct criteria
const analyzeDesignPersonality = (stats, colors, typography) => {
    let points = {};
    Object.keys(DESIGN_ARCHETYPES).forEach(archetype => points[archetype] = 0);

    // Analyze color harmony
    const colorAnalysis = analyzeColorHarmony(colors);
    const colorCount = colors.length;
    const typographyCount = Object.keys(typography).length;

    // The Minimalist Monk
    if (colorCount <= 4 && colorAnalysis.isMonochromatic && stats.total < 500) {
        points["The Minimalist Monk"] += 5;
    }

    // The Color Mystic
    if (colorCount >= 6 && colorAnalysis.isVibrant && colorAnalysis.hasHighContrast) {
        points["The Color Mystic"] += 5;
    }

    // The Grid Guardian
    const hasConsistentSpacing = stats.complexFrames.every(frame => 
        frame.width % 8 === 0 && frame.height % 8 === 0
    );
    if (hasConsistentSpacing && stats.maxDepth <= 5) {
        points["The Grid Guardian"] += 5;
    }

    // The Type Whisperer
    const hasTypeScale = Object.keys(typography).some(style => 
        style.includes('heading') || style.includes('title')
    );
    if (typographyCount >= 5 && hasTypeScale) {
        points["The Type Whisperer"] += 5;
    }

    // The Pixel Prophet
    const hasUniqueLayouts = new Set(
        stats.complexFrames.map(frame => `${frame.width}x${frame.height}`)
    ).size > 5;
    if (hasUniqueLayouts && stats.layerTypes.INSTANCE > 20) {
        points["The Pixel Prophet"] += 5;
    }

    // The Component Composer
    const componentCount = Object.keys(stats.components).length;
    if (componentCount >= 15 && stats.layerTypes.COMPONENT > 10) {
        points["The Component Composer"] += 5;
    }

    // Find primary archetype
    const primaryArchetype = Object.entries(points)
        .sort(([,a], [,b]) => b - a)[0][0];

    // Generate fun facts based on the analysis
    const funFacts = [
        `Your design has ${stats.total.toLocaleString()} layers - ${stats.total > 1000 ? 
            "that's more layers than a millefeuille pastry at a French bakery! 🥐" : 
            "keeping it lighter than a soufflé! 🍮"}`,
        
        `Your color palette rocks ${colorCount} colors - ${colorAnalysis.isVibrant ? 
            "it's like a disco party in a design file! 🕺" : 
            "giving off those cool, calm, collected vibes! 😎"}`,
        
        `Your typography game includes ${typographyCount} styles - ${typographyCount > 5 ? 
            "you're like a font DJ mixing beats! 🎧" : 
            "clean and classic, like a perfectly tailored suit! 👔"}`
    ];

    // Add color-specific fun fact
    if (colorAnalysis.hasHighContrast) {
        funFacts.push("Your contrast game is stronger than my coffee this morning! ☕");
    }

    // Add typography-specific fun fact
    const mostUsedFont = Object.entries(typography)
        .sort(([,a], [,b]) => b - a)[0];
    if (mostUsedFont) {
        funFacts.push(`Your favorite font is getting more action than a superhero movie! 🦸‍♂️`);
    }

    // Add archetype-specific fun fact
    const archetype = DESIGN_ARCHETYPES[primaryArchetype];
    funFacts.push(`As ${primaryArchetype}, ${archetype.description}`);

    return {
        primaryArchetype,
        archetypeInfo: DESIGN_ARCHETYPES[primaryArchetype],
        funFacts,
        compatibility: DESIGN_ARCHETYPES[primaryArchetype].compatibility,
        strengths: DESIGN_ARCHETYPES[primaryArchetype].strengths,
        colorAnalysis: {
            palette: colors,
            harmony: colorAnalysis
        },
        typographyAnalysis: {
            styles: typography,
            mostUsed: mostUsedFont
        }
    };
};

// API Routes
app.get('/api/analyze', async (req, res) => {
    try {
        const figmaUrl = req.query.url;
        if (!figmaUrl) {
            return res.status(400).json({ error: 'Please provide a Figma file URL' });
        }

        const fileKey = extractFileKey(figmaUrl);
        console.log(`Analyzing file with key: ${fileKey}`);
        
        const response = await figmaApi.get(`/files/${fileKey}`);
        const fileData = response.data;
        
        // Comprehensive analysis
        const analytics = analyzeLayerComplexity(fileData.document);
        const colors = analyzeColors(fileData.document);
        const typography = analyzeTypography(fileData.document);
        
        // Analyze design personality
        const personality = analyzeDesignPersonality(analytics, colors, typography);
        
        // Sort complex frames by child count
        analytics.complexFrames.sort((a, b) => b.childCount - a.childCount);
        
        // Get most used components
        const sortedComponents = Object.entries(analytics.components)
            .sort(([,a], [,b]) => b - a)
            .reduce((acc, [key, value]) => ({...acc, [key]: value}), {});
            
        res.json({
            totalLayers: analytics.total,
            maxDepth: analytics.maxDepth,
            layerTypes: analytics.layerTypes,
            mostComplexFrames: analytics.complexFrames.slice(0, 5),
            componentUsage: sortedComponents,
            colors: colors,
            typography: typography,
            personality: personality
        });
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : 'No response data'
        });
        res.status(error.response?.status || 500).json({ 
            error: error.message,
            details: error.response?.data
        });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Available endpoints:');
    console.log('- GET /: View analytics dashboard');
    console.log('- GET /api/analyze: Get raw analysis data');
});
