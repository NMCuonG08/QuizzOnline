import dayjs from 'dayjs';
import quizRepository from '../repositories/quizRepository.js';

export default {
    // Get all quizzes
    async getAllQuizzes() {
        return quizRepository.getAllQuizzes();
    },

    // Get a quiz by ID
    async getQuizById(quizId) {
        return quizRepository.getQuizById(quizId);
    },

    // Add a new quiz
    async addQuiz(quiz) {
        return quizRepository.insertQuiz(quiz);
    },

    // Update image for quiz
    async updateImageQuiz(quizId, imageUrl, public_id) {
        try {
            const mediaId = await quizRepository.insertMediaForQuiz(imageUrl, public_id);
            await quizRepository.updateQuizMedia(quizId, mediaId);
        } catch (error) {
            console.error('Error in updateImageQuiz:', error);
            throw error;
        }
    },

    // Update a quiz by ID
    async updateQuiz(quizId, quizData) {
        try {
            // Make sure all fields are properly sanitized
            return await quizRepository.updateQuiz(quizId, quizData);
        } catch (error) {
            console.error('Error in updateQuiz:', error);
            throw error;
        }
    },

    // Delete a quiz by ID
    async deleteQuiz(quizId) {
        const trx = await quizRepository.beginTransaction();
        try {
            // Get all question IDs associated with this quiz
            const questionIds = await quizRepository.getQuestionIdsForQuiz(quizId, trx);

            // Get all result IDs for this quiz
            const resultIds = await quizRepository.getResultIdsForQuiz(quizId, trx);

            // Get all room IDs using this quiz
            const roomIds = await quizRepository.getRoomIdsForQuiz(quizId, trx);

            // 1. First delete rank entries that reference results
            if (resultIds.length > 0) {
                await quizRepository.deleteRanksByResultIds(resultIds, trx);
            }

            // 2. Delete user answers for these questions
            if (questionIds.length > 0) {
                await quizRepository.deleteUserAnswersByQuestionIds(questionIds, trx);
            }

            // 3. Delete quiz-question mappings
            await quizRepository.deleteQuizQuestionMappings(quizId, trx);

            // 4. Delete questions that are only used by this quiz
            for (const questionId of questionIds) {
                const usageCount = await quizRepository.countQuestionUsage(questionId, trx);

                if (usageCount === 0) {
                    // Delete options for this question
                    await quizRepository.deleteOptionsByQuestionId(questionId, trx);

                    // Delete the question itself
                    await quizRepository.deleteQuestionById(questionId, trx);
                }
            }

            // 5. Delete quiz tags
            await quizRepository.deleteQuizTags(quizId, trx);

            // 6. Delete results (now safe since ranks are deleted)
            await quizRepository.deleteQuizResults(quizId, trx);

            // 7. Delete ratings
            await quizRepository.deleteQuizRatings(quizId, trx);

            // 8. Delete reports
            await quizRepository.deleteQuizReports(quizId, trx);

            // 9. Delete room_user entries first
            if (roomIds.length > 0) {
                await quizRepository.deleteRoomUsers(roomIds, trx);
            }

            // 10. Now safe to delete rooms
            await quizRepository.deleteRooms(quizId, trx);

            // 11. Delete comments
            await quizRepository.deleteQuizComments(quizId, trx);

            // Finally, delete the quiz itself
            await quizRepository.deleteQuizById(quizId, trx);

            await trx.commit();
            return { success: true, message: 'Quiz and all related data deleted successfully' };
        } catch (error) {
            await trx.rollback();
            console.error('Error in deleteQuiz transaction:', error);
            throw error;
        }
    },

    // Get quizzes by category ID
    async getQuizzesByCategoryId(categoryId) {
        try {
            const quizzes = await quizRepository.getQuizzesByCategory(categoryId);

            if (!quizzes || quizzes.length === 0) {
                return [];
            }

            const quizIds = quizzes.map(quiz => quiz.id);
            const mediaIds = quizzes.map(quiz => quiz.media).filter(Boolean);

            // Get media URLs
            const mediaResults = await quizRepository.getMediaByIds(mediaIds);
            const mediaMap = mediaResults.reduce((map, item) => {
                map[item.id] = item.url;
                return map;
            }, {});

            // Get question counts
            const questionCounts = await quizRepository.getQuestionCountsByQuizIds(quizIds);
            const questionCountMap = questionCounts.reduce((map, item) => {
                map[item.quiz_id] = item.count;
                return map;
            }, {});

            return quizzes.map(quiz => ({
                ...quiz,
                imageUrl: quiz.media && mediaMap[quiz.media]
                    ? mediaMap[quiz.media]
                    : 'https://placehold.co/600x400?text=Quiz&bg=f0f4f8',
                numberOfQuestions: questionCountMap[quiz.id] || 0
            }));
        } catch (error) {
            console.error('Error in getQuizzesByCategoryId:', error);
            return [];
        }
    },

    // Get full quiz details
    async getFullQuizDetails(quizId) {
        try {
            // Get basic quiz info
            const quiz = await quizRepository.getQuizDetails(quizId);

            if (!quiz) {
                return null;
            }

            if (quiz.media) {
                const media = await quizRepository.getMediaForQuiz(quiz.media);
                quiz.imageUrl = media ? media.url : null;
            }

            const questionMappings = await quizRepository.getQuestionIdsForQuiz(quizId);
            const questionIds = questionMappings.map(id => id);

            const questions = await quizRepository.getQuestionsForQuiz(questionIds);

            const questionMediaIds = questions
                .map(q => q.img_url)
                .filter(Boolean);

            const mediaResults = await quizRepository.getMediaByIds(questionMediaIds);

            const mediaMap = mediaResults.reduce((map, item) => {
                map[item.id] = item.url;
                return map;
            }, {});

            for (const question of questions) {
                if (question.img_url && mediaMap[question.img_url]) {
                    question.imageUrl = mediaMap[question.img_url];
                } else {
                    question.imageUrl = null;
                }

                const options = await quizRepository.getOptionsForQuestion(question.id);
                question.options = options;
            }

            quiz.questions = questions;
            quiz.questionCount = questions.length;

            return quiz;
        } catch (error) {
            console.error('Error in getFullQuizDetails:', error);
            return null;
        }
    },

    // Add a question to a quiz
    async addQuestionToQuiz(quizId, questionId) {
        try {
            return await quizRepository.addQuestionToQuiz(quizId, questionId);
        } catch (error) {
            console.error('Error in addQuestionToQuiz:', error);
            throw error;
        }
    },

    // Search quizzes
    async searchQuizzes(searchTerm) {
        try {
            // Gọi repository để tìm kiếm với từ khóa
            const quizzes = await quizRepository.searchQuizzes(searchTerm);

            if (!quizzes || quizzes.length === 0) {
                return [];
            }

            // Get additional quiz info
            const quizIds = quizzes.map(quiz => quiz.id);
            const mediaIds = quizzes.map(quiz => quiz.media).filter(Boolean);
            // Lấy thông tin media
            const mediaResults = await quizRepository.getMediaByIds(mediaIds);
            const mediaMap = mediaResults.reduce((map, item) => {
                map[item.id] = item.url;
                return map;
            }, {});

            const questionCounts = await quizRepository.getQuestionCountsByQuizIds(quizIds);
            const questionCountMap = questionCounts.reduce((map, item) => {
                map[item.quiz_id] = item.count;
                return map;
            }, {});

            return quizzes.map(quiz => ({
                ...quiz,
                imageUrl: quiz.media && mediaMap[quiz.media]
                    ? mediaMap[quiz.media]
                    : 'https://placehold.co/600x400?text=Quiz&bg=f0f4f8',
                numberOfQuestions: questionCountMap[quiz.id] || 0
            }));
        } catch (error) {
            console.error('Error in searchQuizzes:', error);
            return [];
        }
    },

    // Get quiz page details
    async getQuizPageDetails(quizId) {
        try {
            // --- Basic Quiz Info ---
            const quiz = await quizRepository.getQuizPageBasicInfo(quizId);

            if (!quiz) {
                return null; // Quiz not found
            }

            // --- Questions ---
            const questions = await quizRepository.getQuizQuestions(quizId);
            const questionCount = questions.length;
            
            // Estimate time based on question count
            const estimatedMinutes = Math.ceil((questionCount * 20) / 60);

            // --- Tags ---
            const tags = await quizRepository.getQuizTags(quizId);

            // --- Stats: Player Count & Average Rating ---
            const resultsStats = await quizRepository.getQuizResultsStats(quizId);
            const playerCount = resultsStats ? Number(resultsStats.playerCount) : 0;

            const ratingStats = await quizRepository.getQuizRatingStats(quizId);
            
            // Ensure rating is a number, default to 0, and round it to one decimal place
            const rating = Math.round((Math.max(0, Math.min(5, parseFloat(ratingStats?.averageRating || 0))) + Number.EPSILON) * 10) / 10;
            const ratingCount = parseInt(ratingStats?.ratingCount || 0, 10);

            // --- Comments ---
            const comments = await quizRepository.getQuizComments(quizId);

            // Process comments to add initials if no avatar
            comments.forEach(comment => {
                comment.authorInitials = comment.authorUsername ? comment.authorUsername.charAt(0).toUpperCase() : '?';
            });

            // --- Leaderboard (Top 5) ---
            const leaderboard = await quizRepository.getQuizLeaderboard(quizId, 5);

            // Calculate duration for leaderboard entries
            leaderboard.forEach(entry => {
                const startTime = dayjs(entry.start_time);
                const endTime = dayjs(entry.end_time);
                const duration = endTime.diff(startTime, 'second');
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                entry.timeTakenFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                entry.scoreFormatted = `${entry.score}`;
            });

            // --- Construct the final data object ---
            return {
                quiz: {
                    id: quiz.id,
                    title: quiz.title,
                    description: quiz.description,
                    coverImageUrl: quiz.coverImageUrl || null,
                    tags: tags,
                },
                stats: {
                    playerCount: playerCount,
                    averageRating: rating,
                    questionCount: questionCount,
                    estimatedMinutes: estimatedMinutes
                },
                rating: {
                    average: rating,
                    count: ratingCount,
                },
                comments: comments,
                leaderboard: leaderboard
            };
        } catch (error) {
            console.error(`Error fetching quiz details for ID ${quizId}:`, error);
            throw error;
        }
    },

    // Get quizzes with details
    async getQuizzesWithDetails(userId) {
        try {
            // Get quizzes with related data
            const quizzes = await quizRepository.getQuizzesWithDetails(userId);

            // Format each quiz
            const formattedQuizzes = quizzes.map((quiz, index) => {
                const createdDate = new Date(quiz.created_at);
                const now = new Date();
                const diffTime = Math.abs(now - createdDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return {
                    id: quiz.id,
                    rowNumber: index + 1,
                    title: quiz.title,
                    description: quiz.description,
                    categoryName: quiz.categoryName || 'Uncategorized',
                    tagsString: quiz.tagsString || '',
                    // Use the actual media URL if available, otherwise use placeholder
                    imageUrl: quiz.mediaUrl || 'https://placehold.co/40x40/e1e1e1/909090?text=Q',
                    formattedCreatedAt: createdDate.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit'
                    }),
                    relativeUpdatedAt: diffDays === 0 ? 'today' :
                        diffDays === 1 ? 'yesterday' :
                            `${diffDays} days ago`
                };
            });

            return formattedQuizzes;
        } catch (error) {
            console.error('Error in getQuizzesWithDetails:', error);
            throw error;
        }
    }
};