const express = require('express');
const router = express.Router();
const passport = require('passport');
const axios = require('axios');
const User = require('../models/user');

// Helper function to extract file key from Figma URL
function extractFileKey(url) {
    // Handle both full URLs and direct keys
    if (!url) return null;
    
    // Try to match the key from various Figma URL formats
    const patterns = [
        /figma\.com\/file\/([^/?]+)/,      // Standard file URL
        /figma\.com\/design\/([^/?]+)/,    // Design URL
        /\/([a-zA-Z0-9]{22,})/,            // Any 22+ char key in URL
        /^([a-zA-Z0-9]{22,})/              // Direct key
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

// Helper function to analyze design statistics
function analyzeDesignStats(fileData) {
    console.log('Starting design stats analysis');
    let stats = {
        totalLayers: 0,
        maxDepth: 0,
        mostComplexFrames: [],
        layerTypes: {},
        componentUsage: {},
        colors: new Set(),
        typography: {}
    };

    function traverseNode(node, depth = 0) {
        if (!node) return;
        
        console.log(`Traversing node: ${node.name} (${node.type})`);
        stats.totalLayers++;
        stats.maxDepth = Math.max(stats.maxDepth, depth);

        // Count layer types
        stats.layerTypes[node.type] = (stats.layerTypes[node.type] || 0) + 1;

        // Track colors from various sources
        if (node.fills) {
            node.fills.forEach(fill => {
                if (fill.type === 'SOLID' && fill.color) {
                    const color = `rgb(${Math.round(fill.color.r * 255)}, ${Math.round(fill.color.g * 255)}, ${Math.round(fill.color.b * 255)})`;
                    stats.colors.add(color);
                }
            });
        }

        // Track colors from strokes
        if (node.strokes) {
            node.strokes.forEach(stroke => {
                if (stroke.type === 'SOLID' && stroke.color) {
                    const color = `rgb(${Math.round(stroke.color.r * 255)}, ${Math.round(stroke.color.g * 255)}, ${Math.round(stroke.color.b * 255)})`;
                    stats.colors.add(color);
                }
            });
        }

        // Track typography
        if (node.style) {
            const fontKey = `${node.style.fontFamily || 'Unknown'} ${node.style.fontSize || 'auto'}px`;
            stats.typography[fontKey] = (stats.typography[fontKey] || 0) + 1;
        }

        // Track component usage
        if (node.componentId) {
            const componentName = node.name || 'Unnamed Component';
            stats.componentUsage[componentName] = (stats.componentUsage[componentName] || 0) + 1;
        }

        // Track complex frames
        if (node.type === 'FRAME' && node.children) {
            stats.mostComplexFrames.push({
                name: node.name,
                childCount: node.children.length
            });
        }

        // Recursively process children
        if (node.children) {
            node.children.forEach(child => traverseNode(child, depth + 1));
        }
    }

    // Start traversal from the document root
    if (fileData.document) {
        console.log('Starting document traversal');
        traverseNode(fileData.document);
    }

    // Sort and limit complex frames
    stats.mostComplexFrames.sort((a, b) => b.childCount - a.childCount);
    stats.mostComplexFrames = stats.mostComplexFrames.slice(0, 5);

    // Convert colors Set to Array
    stats.colors = Array.from(stats.colors);

    console.log('Analysis complete:', stats);
    return stats;
}

// Helper function to analyze design personality
function analyzeDesignPersonality(stats) {
    const archetypes = {
        'The Design Systems Master': {
            emoji: '🏗️',
            description: 'You think in components and design at scale. Your designs are like well-oiled machines - systematic, reusable, and incredibly efficient.',
            strengths: ['Component Architecture', 'Scalable Design', 'Documentation'],
            compatibility: {
                archetype: 'The Visual Explorer',
                reason: 'Your systematic foundation gives them the perfect playground to innovate. Together, you create design systems that are both robust and inspiring!'
            }
        },
        'The Visual Explorer': {
            emoji: '🎨',
            description: 'You have an eye for unique aesthetics and emerging trends. Your designs often become tomorrow\'s inspiration for others.',
            strengths: ['Visual Innovation', 'Color Theory', 'Creative Direction'],
            compatibility: {
                archetype: 'The UX Strategist',
                reason: 'While you push creative boundaries, they ensure everything stays user-friendly. Together, you create delightful experiences that actually work!'
            }
        },
        'The UX Strategist': {
            emoji: '🧭',
            description: 'You see design through the lens of user behavior. Every pixel serves a purpose in your quest for perfect user experiences.',
            strengths: ['User Flows', 'Information Architecture', 'Interaction Design'],
            compatibility: {
                archetype: 'The Brand Storyteller',
                reason: 'Your user-first approach helps their stories resonate with the right audience. Together, you create experiences that both captivate and convert!'
            }
        },
        'The Layout Perfectionist': {
            emoji: '📐',
            description: 'Your attention to spacing and alignment is legendary. You can spot a misaligned element from miles away.',
            strengths: ['Grid Systems', 'Visual Hierarchy', 'Responsive Design'],
            compatibility: {
                archetype: 'The Design Systems Master',
                reason: 'Your pixel-perfect precision helps their systems stay consistent. Together, you build frameworks that scale beautifully!'
            }
        },
        'The Brand Storyteller': {
            emoji: '✨',
            description: 'You craft cohesive brand experiences that tell compelling stories. Every design choice reinforces the brand narrative.',
            strengths: ['Brand Identity', 'Visual Storytelling', 'Typography'],
            compatibility: {
                archetype: 'The Layout Perfectionist',
                reason: 'While you weave the brand story, they ensure it\'s told with perfect clarity. Together, you create memorable brand experiences!'
            }
        }
    };

    let scores = {
        'The Design Systems Master': 0,
        'The Visual Explorer': 0,
        'The UX Strategist': 0,
        'The Layout Perfectionist': 0,
        'The Brand Storyteller': 0
    };

    // Analyze component usage and consistency
    const componentRatio = Object.keys(stats.componentUsage || {}).length / (stats.totalLayers || 1);
    const componentReuse = Object.values(stats.componentUsage || {}).reduce((sum, count) => sum + count, 0) / (stats.totalLayers || 1);
    
    if (componentRatio > 0.2) scores['The Design Systems Master'] += 2;
    if (componentReuse > 0.3) scores['The Design Systems Master'] += 2;

    // Analyze color usage and harmony
    const colorCount = stats.colors?.length || 0;
    const uniqueShades = new Set(stats.colors?.map(color => color.toLowerCase()) || []).size;
    
    if (colorCount > 12) scores['The Visual Explorer'] += 2;
    if (uniqueShades > colorCount * 0.8) scores['The Brand Storyteller'] += 1;

    // Analyze layout structure
    const avgFrameComplexity = stats.mostComplexFrames?.[0]?.childCount || 0;
    const hasNestedStructure = stats.maxDepth > 5;
    
    if (avgFrameComplexity > 15) scores['The UX Strategist'] += 2;
    if (hasNestedStructure) scores['The Layout Perfectionist'] += 2;

    // Analyze typography usage
    const typographyStyles = Object.keys(stats.typography || {}).length;
    const hasConsistentType = typographyStyles <= 5;
    
    if (hasConsistentType) scores['The Brand Storyteller'] += 2;
    if (typographyStyles > 6) scores['The Visual Explorer'] += 1;

    // Analyze spacing and alignment
    const hasAutoLayout = stats.layerTypes?.['FRAME']?.autoLayout || false;
    if (hasAutoLayout) scores['The Layout Perfectionist'] += 2;

    // Generate personality-specific fun facts
    const funFacts = [];
    
    if (componentReuse > 0.3) {
        funFacts.push(`🎯 Your components are reused ${Math.round(componentReuse * 100)}% of the time - that's some serious design system thinking!`);
    }

    if (colorCount > 0) {
        if (uniqueShades > colorCount * 0.8) {
            funFacts.push(`🎨 You've crafted a rich palette of ${colorCount} colors - each one telling part of your brand story!`);
        } else {
            funFacts.push(`🎨 You maintain a focused palette of ${colorCount} colors - keeping things clean and impactful!`);
        }
    }

    if (avgFrameComplexity > 0) {
        funFacts.push(`📱 Your most complex screen has ${avgFrameComplexity} elements - ${avgFrameComplexity > 20 ? 'you love creating rich experiences!' : 'nicely organized!'}`);
    }

    if (typographyStyles > 0) {
        funFacts.push(`📝 Your typography system uses ${typographyStyles} styles - ${typographyStyles <= 5 ? 'maintaining beautiful consistency!' : 'expressing through type!'}`);
    }

    // Find primary archetype
    const primaryArchetype = Object.entries(scores)
        .sort(([,a], [,b]) => b - a)[0][0];

    // Get the compatibility info
    const compatibility = archetypes[primaryArchetype].compatibility;

    // Add debug logging
    console.log('Analysis Results:', {
        primaryArchetype,
        archetypeInfo: archetypes[primaryArchetype],
        compatibility,
        scores
    });

    return {
        primaryArchetype,
        archetypeInfo: archetypes[primaryArchetype],
        compatibility: archetypes[primaryArchetype].compatibility,
        funFacts,
        score: scores[primaryArchetype]
    };
}

// Helper function to analyze file
function analyzeFile(fileData) {
    const stats = {
        totalLayers: 0,
        maxDepth: 0,
        colors: new Set(),
        layerTypes: {},
        componentUsage: {},
        typography: {},
        mostComplexFrames: []
    };

    function traverseNode(node, depth = 0) {
        if (!node) return;

        // Track layer count and types
        stats.totalLayers++;
        stats.layerTypes[node.type] = (stats.layerTypes[node.type] || 0) + 1;

        // Track max depth
        stats.maxDepth = Math.max(stats.maxDepth, depth);

        // Track colors
        if (node.fills) {
            node.fills.forEach(fill => {
                if (fill.type === 'SOLID' && fill.color) {
                    const { r, g, b } = fill.color;
                    const hex = rgbToHex(r * 255, g * 255, b * 255);
                    stats.colors.add(hex);
                }
            });
        }

        // Track component usage
        if (node.componentId) {
            const componentName = node.name || node.componentId;
            stats.componentUsage[componentName] = (stats.componentUsage[componentName] || 0) + 1;
        }

        // Track typography
        if (node.style && node.style.fontFamily) {
            const fontKey = `${node.style.fontFamily}-${node.style.fontSize}`;
            stats.typography[fontKey] = (stats.typography[fontKey] || 0) + 1;
        }

        // Track complex frames
        if (node.type === 'FRAME' && node.children) {
            stats.mostComplexFrames.push({
                name: node.name,
                childCount: node.children.length
            });
        }

        // Recursively process children
        if (node.children) {
            node.children.forEach(child => traverseNode(child, depth + 1));
        }
    }

    // Start traversal from document
    if (fileData.document) {
        traverseNode(fileData.document);
    }

    // Sort and limit most complex frames
    stats.mostComplexFrames.sort((a, b) => b.childCount - a.childCount);
    stats.mostComplexFrames = stats.mostComplexFrames.slice(0, 5);

    // Convert color Set to Array
    stats.colors = Array.from(stats.colors);

    return stats;
}

function rgbToHex(r, g, b) {
    const toHex = (n) => {
        const hex = Math.round(n).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Analyze Figma file
router.get('/analyze', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        const fileKey = extractFileKey(url);
        if (!fileKey) {
            console.log('Failed to extract file key from URL:', url);
            return res.status(400).json({ error: 'Invalid Figma URL or file key' });
        }

        // Get the full user with access token
        const user = await User.findById(req.user._id).select('+accessToken');
        if (!user || !user.accessToken) {
            console.log('User or access token not found:', req.user._id);
            return res.status(401).json({ error: 'Please log in again' });
        }

        // Decrypt the access token
        const decryptedToken = user.getAccessToken();
        if (!decryptedToken) {
            console.log('Failed to decrypt access token');
            return res.status(401).json({ error: 'Invalid access token. Please log in again.' });
        }
        
        console.log('Analyzing file:', fileKey);
        
        // Get file data from Figma API
        const figmaUrl = `https://api.figma.com/v1/files/${fileKey}`;
        console.log('Making Figma API request to:', figmaUrl);
        
        const response = await axios.get(figmaUrl, {
            headers: {
                'Authorization': `Bearer ${decryptedToken}`,
                'X-Figma-Token': decryptedToken
            }
        });

        const fileData = response.data;
        console.log('File data received. Document structure:', JSON.stringify({
            name: fileData.name,
            lastModified: fileData.lastModified,
            version: fileData.version,
            documentStructure: {
                type: fileData.document?.type,
                childrenCount: fileData.document?.children?.length || 0,
                firstChildType: fileData.document?.children?.[0]?.type
            }
        }, null, 2));

        // Analyze the file
        console.log('Starting analysis...');
        const stats = analyzeFile(fileData);
        console.log('Stats analysis complete:', JSON.stringify(stats, null, 2));
        
        const personality = analyzeDesignPersonality(stats);
        console.log('Personality analysis complete:', JSON.stringify(personality, null, 2));

        // Update user's recent files
        await User.findByIdAndUpdate(
            req.user._id,
            {
                $push: {
                    recentFiles: {
                        $each: [{
                            fileKey,
                            fileName: fileData.name,
                            lastAccessed: new Date()
                        }],
                        $slice: -5 // Keep only the 5 most recent files
                    }
                }
            }
        );

        console.log('Sending analysis response...');
        res.json({
            stats,
            personality,
            debug: {
                fileKey,
                fileName: fileData.name,
                documentType: fileData.document?.type,
                hasChildren: Boolean(fileData.document?.children?.length)
            }
        });

    } catch (error) {
        console.error('Analysis error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: req.query.url,
            extractedKey: extractFileKey(req.query.url)
        });
        
        // Check for specific error cases
        if (error.response?.status === 404) {
            return res.status(404).json({
                error: 'Figma file not found',
                details: 'Make sure the file exists and you have access to it',
                fileKey: extractFileKey(req.query.url)
            });
        }
        
        if (error.response?.status === 403) {
            return res.status(403).json({
                error: 'Access denied',
                details: 'You do not have permission to access this file or your session has expired. Please try logging in again.'
            });
        }

        res.status(500).json({
            error: 'Failed to analyze file',
            details: error.response?.data || error.message,
            debug: {
                errorType: error.name,
                errorStack: error.stack
            }
        });
    }
});

// Get user's recent files
router.get('/recent-files', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ recentFiles: user.recentFiles || [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent files' });
    }
});

module.exports = router;
