import { Router } from "express";
import db from "../configs/db.js";

const router = new Router();

// Get all quizzes (optimized for mobile)
router.get("/quizzes", async (req, res) => {
  try {
    // Query basic quiz info with category name and question count
    const quizzes = await db("quiz as q")
      .select(
        "q.id", 
        "q.title", 
        "q.description", 
        "q.createdBy",
        "q.category",
        "c.name as categoryName",
        "q.media"
      )
      .leftJoin("category as c", "q.category", "c.id")
      .orderBy("q.id", "desc");

    // Get question counts for each quiz
    const quizIds = quizzes.map(quiz => quiz.id);
    const questionCounts = await db("quiz_question")
      .whereIn("quiz_id", quizIds)
      .select("quiz_id")
      .count("question_id as count")
      .groupBy("quiz_id");
    
    // Convert to a map for easy lookup
    const questionCountMap = {};
    questionCounts.forEach(item => {
      questionCountMap[item.quiz_id] = parseInt(item.count);
    });

    // Get media URLs for quizzes
    const mediaIds = quizzes.filter(q => q.media).map(q => q.media);
    const mediaResults = await db("media")
      .whereIn("id", mediaIds)
      .select("id", "url");
    
    const mediaMap = {};
    mediaResults.forEach(item => {
      mediaMap[item.id] = item.url;
    });

    // Format the result for the mobile app
    const formattedQuizzes = quizzes.map(quiz => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      createdBy: quiz.createdBy,
      categoryId: quiz.category,
      categoryName: quiz.categoryName || "General",
      questionCount: questionCountMap[quiz.id] || 0,
      imageUrl: quiz.media ? mediaMap[quiz.media] : ""
    }));

    res.json(formattedQuizzes);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

// Get quiz details by ID
router.get("/quizzes/:id", async (req, res) => {
  try {
    const quizId = req.params.id;
    
    // Get quiz details
    const quiz = await db("quiz as q")
      .where("q.id", quizId)
      .select(
        "q.id",
        "q.title", 
        "q.description", 
        "q.createdBy",
        "q.category",
        "c.name as categoryName",
        "q.media"
      )
      .leftJoin("category as c", "q.category", "c.id")
      .first();
      
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    
    // Get creator name
    const creator = await db("user")
      .where("id", quiz.createdBy)
      .select("username")
      .first();
      
    // Get question count
    const questionCount = await db("quiz_question")
      .where("quiz_id", quizId)
      .count("question_id as count")
      .first();
    
    // Get media URL
    let imageUrl = "";
    if (quiz.media) {
      const media = await db("media")
        .where("id", quiz.media)
        .select("url")
        .first();
      if (media) {
        imageUrl = media.url;
      }
    }
    
    // Get average rating
    const ratingResult = await db("rate")
      .where("quiz", quizId)
      .avg("score as averageRating")
      .first();
      
    // Get tags
    const tags = await db("quiz_tag as qt")
      .where("qt.quiz_id", quizId)
      .join("tag as t", "t.id", "qt.tag_id")
      .select("t.name");
      
    const formattedQuiz = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      createdBy: quiz.createdBy,
      creatorName: creator ? creator.username : "Unknown",
      categoryId: quiz.category,
      categoryName: quiz.categoryName || "General",
      questionCount: questionCount ? parseInt(questionCount.count) : 0,
      imageUrl: imageUrl,
      averageRating: ratingResult ? parseFloat(ratingResult.averageRating) || 0 : 0,
      tags: tags.map(tag => tag.name)
    };
    
    res.json(formattedQuiz);
  } catch (error) {
    console.error("Error fetching quiz details:", error);
    res.status(500).json({ error: "Failed to fetch quiz details" });
  }
});

export default router;