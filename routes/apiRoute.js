import express from "express";
import quizService from "../services/quizService.js";
import questionService from "../services/questionService.js";
import categoryService from "../services/categoryService.js";

const router = express.Router();

// Lấy danh sách tất cả quiz
router.get("/quizzes", async (req, res) => {
    try {
        const quizzes = await quizService.getAllQuizzes();
        res.json({
            success: true,
            data: quizzes
        });
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quizzes'
        });
    }
});

// Lấy chi tiết quiz theo ID
router.get("/quiz/:id", async (req, res) => {
    try {
        const quizId = req.params.id;
        const quizDetails = await quizService.getQuizPageDetails(quizId);
        
        if (!quizDetails) {
            return res.status(404).json({ 
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            data: quizDetails
        });
    } catch (error) {
        console.error('Error fetching quiz details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quiz details'
        });
    }
});

// Lấy danh sách categories
router.get("/categories", async (req, res) => {
    try {
        const categories = await categoryService.getAllCategories();
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories'
        });
    }
});

// Lấy danh sách quiz theo category
router.get("/quizzes/category/:categoryId", async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const quizzes = await quizService.getQuizzesByCategoryId(categoryId);
        
        res.json({
            success: true,
            data: quizzes
        });
    } catch (error) {
        console.error('Error fetching quizzes by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quizzes by category'
        });
    }
});

// API tìm kiếm quiz
router.get("/quizzes/search", async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        
        if (!searchTerm.trim()) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        const quizzes = await quizService.searchQuizzes(searchTerm);
        
        res.json({
            success: true,
            data: quizzes
        });
    } catch (error) {
        console.error('Error searching quizzes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search quizzes'
        });
    }
});

export default router;