import resultService from "../services/resultService.js";
import userService from "../services/userService.js";
import questionService from "../services/questionService.js";
import optionService from "../services/optionService.js";
import quizService from '../services/quizService.js';
import strategieService from "../strategies/searchQuizzesWithFallback.js";
import moment from "moment";
import tagService from '../services/tagService.js';
import categoryService from '../services/categoryService.js';

export default {
    // Existing methods
    checkResult: async (req, res) => {
        const resultId = req.params.id;

        // Get result and user data
        const result = await resultService.getResultById(resultId) || 0;
        const userId = result.user;
        const user = await userService.getUserById(userId) || 0;
        const quizId = result.quiz; // Get the quiz ID from the result

        // Get all questions for this quiz
        const allQuestions = await questionService.getQuestionsByQuizId(quizId) || [];

        // Get user's actual answers
        const userAnswers = await resultService.getUserAnswersByResultId(resultId) || [];

        // Create a map of user answers for quick lookup
        const userAnswerMap = {};
        userAnswers.forEach(answer => {
            userAnswerMap[answer.question_id] = answer;
        });

        // Process all questions (answered and unanswered)
        const answers = await Promise.all(allQuestions.map(async (question) => {
            // Get user's answer for this question or null if not answered
            const userAnswer = userAnswerMap[question.id] || null;

            // Xử lý dựa trên loại câu hỏi
            let isCorrect = false;
            let correctOption = null;
            let allOptions = [];
            let userSelectedOptions = [];
            let correctAnswer = '';

            switch (question.type) {
                case 'SINGLE_ANSWER':
                case 'TRUE_FALSE':
                    // Lấy đáp án đúng
                    correctOption = await optionService.getCorrectOptionByQuestionId(question.id) || null;

                    // Lấy tất cả các đáp án
                    allOptions = await optionService.getOptionsByQuestionId(question.id) || [];

                    // Kiểm tra nếu người dùng trả lời đúng
                    isCorrect = userAnswer && correctOption && userAnswer.option_id === correctOption.id;
                    break;

                case 'MULTIPLE_ANSWER':
                    // Lấy tất cả đáp án đúng
                    const correctOptions = await optionService.getCorrectOptionsByQuestionId(question.id) || [];
                    const correctOptionIds = correctOptions.map(opt => opt.id);

                    // Lấy tất cả các đáp án
                    allOptions = await optionService.getOptionsByQuestionId(question.id) || [];

                    // Lấy câu trả lời của người dùng
                    let selectedOptions = [];
                    if (userAnswer && userAnswer.selected_options) {
                        try {
                            // Chuyển đổi sang mảng số nguyên
                            if (Array.isArray(userAnswer.selected_options)) {
                                selectedOptions = userAnswer.selected_options.map(id => parseInt(id, 10));
                            } else {
                                // Nếu là chuỗi JSON, parse trước
                                const parsedOptions = JSON.parse(userAnswer.selected_options);
                                selectedOptions = Array.isArray(parsedOptions) ?
                                    parsedOptions.map(id => parseInt(id, 10)) : [];
                            }
                        } catch (e) {
                            selectedOptions = [];
                        }
                    }
                    userSelectedOptions = selectedOptions;


                    // Đánh dấu các options đã được chọn và đúng/sai
                    allOptions = allOptions.map(option => ({
                        ...option,
                        isSelected: selectedOptions.includes(option.id),
                        isCorrect: correctOptionIds.includes(option.id)
                    }));


                    // Đúng khi chọn đủ và đúng tất cả các đáp án cần chọn
                    isCorrect = correctOptionIds.length > 0 &&
                        selectedOptions.length === correctOptionIds.length &&
                        correctOptionIds.every(id => selectedOptions.includes(id));
                    break;

                case 'FILL_IN_THE_BLANK':
                    // Lấy câu trả lời đúng
                    correctAnswer = await optionService.getCorrectAnswerByQuestionId(question.id) || '';

                    // So sánh với câu trả lời của người dùng (không phân biệt hoa thường)
                    const userText = userAnswer ? userAnswer.text_answer || '' : '';
                    isCorrect = correctAnswer && userText &&
                        userText.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                    break;
            }

            return {
                question_id: question.id,
                question_type: question.type,
                option_id: userAnswer ? userAnswer.option_id : null,
                text_answer: userAnswer ? userAnswer.text_answer : null,
                selected_options: userSelectedOptions,
                result_id: resultId,
                question: question,
                correctOption: correctOption,
                correctAnswer: correctAnswer,
                allOptions: allOptions,
                isCorrect: isCorrect,
                isAnswered: !!userAnswer,
                correctOptionId: correctOption ? correctOption.id : null,
                correctOptionText: correctOption
                    ? correctOption.text || correctOption.content
                    : (correctAnswer || "No correct answer defined")
            };
        }));

        // Calculate duration
        const startTime = moment(result.start_time);
        const endTime = moment(result.end_time);
        const duration = moment.duration(endTime.diff(startTime));
        const formattedDuration = `${duration.hours()} giờ ${duration.minutes()} phút ${duration.seconds()} giây`;

        const data = {
            result: result,
            user: user,
            answers: answers,
            duration: formattedDuration
        };

        res.render('quiz/checkResultE', {
            data,
            layout: false,
        });
    },

    addFullQuiz: async (req, res) => {
        try {
            const data = req.body;
            const quiz = {
                title: data.quizTitle,
                description: data.quizDescription,
                createdBy: session.userID || 1,
                category: data.categoryId,
                tag: data.tag,
                time: new Date().toISOString().slice(0, 19).replace('T', ' '),
                media: data.quizMedia
            };

            // Add the quiz to the database and get the inserted quiz ID
            const quizId = await quizService.addQuiz(quiz) || 0;

            // Get question from request body and add them to the quiz
            const questions = data.questionList || [];

            // Add quizId to each question object and add new question to the database
            const insertedQuestions = await questionService.addQuestions(quizId, questions) || 0;

            // Now add options for each inserted question using their "option" property
            await answerService.addOptionsForAllQuestions(questions, insertedQuestions) || 0;

            res.json({
                message: "Quiz created successfully",
                quizId,
                insertedQuestions
            });
        } catch (error) {
            console.error('Error creating quiz:', error);
            res.status(500).json({ error: 'Failed to create quiz' });
        }
    },

    searchQuizzes: async (req, res) => {
        try {
            const searchTerm = req.query.q || '';

            // Check if the search term is empty
            if (!searchTerm.trim()) {
                return res.render('search-results', {
                    quizzes: [],
                    searchTerm: '',
                    noResults: true,
                    isEmpty: true,
                    title: 'Kết quả tìm kiếm'
                });
            }
            // Use the search service to find quizzes
            const quizzes = await quizService.searchQuizzes(searchTerm);
            // Render view with search results
            res.render('search-results', {
                quizzes,
                searchTerm,
                noResults: quizzes.length === 0,
                isEmpty: false,
                title: `Kết quả tìm kiếm: ${searchTerm}`
            });
        } catch (error) {
            console.error('Error searching quizzes:', error);
            res.status(500).render('error', {
                message: 'Đã xảy ra lỗi khi tìm kiếm quiz',
                title: 'Lỗi'
            });
        }
    },

    // New methods extracted from routes
    togglePublishQuiz: async (req, res) => {
        try {
            const quizId = req.params.id;
            // Add fallback in case req.body is undefined
            const published = req.body && req.body.published !== undefined ? req.body.published : false;

            // Update the quiz in the database
            await quizService.updateQuiz(quizId, { published });

            res.json({
                success: true,
                message: published ? 'Quiz published successfully' : 'Quiz unpublished successfully'
            });
        } catch (error) {
            console.error('Error toggling quiz publish status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update quiz status'
            });
        }
    },

    getDashboardQuizzes: async (req, res) => {
        try {
            const userId = req.session.authUser?.user || req.user?.id || 1;
            const quizzes = await quizService.getQuizzesWithDetails(userId);

            res.render('quizzes_dataFilled', {
                layout: 'student',
                quizzes: quizzes
            });
        } catch (error) {
            console.error('Error fetching quizzes:', error);
            res.status(500).render('error', { message: 'Failed to load quizzes.' });
        }
    },

    getQuestionsByQuizId: async (req, res) => {
        try {
            const quizId = req.params.id;
            const questions = await questionService.getQuestionsByQuizId(quizId) || [];

            res.render('question_dataFilled', {
                quizId: quizId,
                layout: "student",
                questions: questions
            });
        } catch (error) {
            console.error('Error loading quiz page:', error);
            res.status(500).render('error', { message: 'Failed to load quiz page' });
        }
    },

    updateQuizMedia: async (req, res) => {
        try {
            const quizId = req.params.id;
            const { image, public_id } = req.body;

            if (!image) {
                return res.status(400).json({ error: 'No media ID provided' });
            }

            await quizService.updateImageQuiz(quizId, image, public_id);

            res.json({
                success: true,
                message: 'Quiz media updated successfully'
            });

        } catch (error) {
            console.error('Error updating quiz media:', error);
            res.status(500).json({ error: 'Failed to update quiz media' });
        }
    },

    // Fix in quizController.js - createQuiz function
       createQuiz: async (req, res) => {
        try {
            const data = req.body;
            console.log('Received quiz data:', data);

            const userId = req.session.authUser?.user || req.user?.id || 1;

            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }

            // Basic validation
            if (!data.quizTitle || !data.quizDescription || !data.categoryId) {
                return res.status(400).json({ error: 'Missing required quiz fields' });
            }

            // Handle tags
            let tagIds = [];
            if (data.tags) {
                tagIds = await tagService.findOrCreateTags(data.tags);
            }

            const quiz = {
                title: data.quizTitle,
                description: data.quizDescription,
                createdBy: userId,
                category: parseInt(data.categoryId, 10),
                tag: tagIds.length > 0 ? tagIds.join(',') : null,
                time: new Date(),
                media: null,
            };
            
            console.log('Quiz data:', quiz);

            // Fix: Handle different possible return types from addQuiz
            const result = await quizService.addQuiz(quiz);
            let newQuizId;

            if (Array.isArray(result)) {
                // If result is an array, get the first element
                newQuizId = result[0];
            } else if (result && typeof result === 'object' && 'id' in result) {
                // If result is an object with an id property
                newQuizId = result.id;
            } else if (typeof result === 'number') {
                // If result is a direct ID number
                newQuizId = result;
            } else {
                console.error('Unexpected response from addQuiz:', result);
                return res.status(500).json({ error: 'Failed to create quiz: Invalid response' });
            }

            if (!newQuizId) {
                return res.status(500).json({ error: 'Failed to create quiz' });
            }

            // Update quiz image if imageUrl and public_id are provided
            if (data.imageUrl && data.public_id) {
                try {
                    await quizService.updateImageQuiz(newQuizId, data.imageUrl, data.public_id);
                    console.log(`Updated quiz ${newQuizId} with image: ${data.imageUrl}`);
                } catch (imageError) {
                    console.error('Error updating quiz image:', imageError);
                    // Continue despite image update error
                }
            }

            res.json({
                success: true,
                message: 'Quiz created successfully',
                redirectUrl: `/question/${newQuizId}/add-question`
            });

        } catch (error) {
            console.error('Error creating quiz:', error);
            res.status(500).json({
                error: 'Failed to create quiz',
                message: error.message
            });
        }
    },

    getQuizById: async (req, res) => {
        const quizId = req.params.id;

        try {
            // Fetch quiz details using the getQuizPageDetails function
            const quizPageDetails = await quizService.getQuizPageDetails(quizId);

            if (!quizPageDetails) {
                return res.status(404).render('quiz/quizDetail', { message: 'Quiz not found' });
            }
            req.session.authorizedQuizAccess = quizId;

            // Render the quizDetail view with the fetched data
            res.render('quiz/quizDetail_dataFilled', {
                layout: false,
                quiz: quizPageDetails.quiz,
                stats: quizPageDetails.stats,
                rating: quizPageDetails.rating,
                comments: quizPageDetails.comments,
                leaderboard: quizPageDetails.leaderboard
            });
        } catch (error) {
            console.error('Error rendering quiz details:', error);
            res.status(500).render('error', { message: 'Failed to render quiz details' });
        }
    },

    updateQuiz: async (req, res) => {
        try {
            const quizId = parseInt(req.params.id);
            if (!quizId) {
                return res.status(400).json({ error: 'Invalid quiz ID' });
            }

            // Log the incoming request body for debugging
            console.log('Received quiz data:', req.body);

            const { quizTitle, quizDescription, categoryId, tag } = req.body;

            // Validate required fields
            if (!quizTitle || !categoryId) {
                return res.status(400).json({ error: 'Quiz title and category are required' });
            }

            // Handle tags
            let tagIds = [];
            if (tag) {
                tagIds = await tagService.findOrCreateTags(tag);
            }

            const dataToUpdate = {
                title: quizTitle,
                description: quizDescription,
                category: parseInt(categoryId),
                tag: tagIds.length > 0 ? tagIds.join(',') : null
            };

            const updatedQuiz = await quizService.updateQuiz(quizId, dataToUpdate);

            res.json({
                success: true,
                message: 'Quiz updated successfully',
                data: updatedQuiz
            });
        } catch (error) {
            console.error('Error updating quiz:', error);
            res.status(500).json({
                error: 'Failed to update quiz',
                message: error.message
            });
        }
    },

    deleteQuiz: async (req, res) => {
        try {
            const quizId = req.params.id;
            const result = await quizService.deleteQuiz(quizId);
            res.json({
                success: true,
                message: result.message || 'Quiz deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting quiz:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete quiz',
                message: error.message
            });
        }
    },

    doTestQuiz: async (req, res) => {
        try {
            const quizId = req.params.id;

            const test = await quizService.getFullQuizDetails(quizId);
            const userId = req.session.authUser.user || 1;

            let startTime = new Date();
            let endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
            if (!test) {
                return res.status(404).json({ error: 'Quiz not found' });
            }

            if (!test.questions || !Array.isArray(test.questions)) {
                test.questions = [];
            }

            test.questions.forEach((question, index) => {
                question.question_number = index + 1;
            });
            let answer = [];
            let resultId = null;
            let newResultId = 0;
            const checkExistResult = await resultService.checkExistResult(test.id, userId) || 0

            if (checkExistResult) {
                resultId = checkExistResult.result.id;
                answer = checkExistResult.userAnswers || [];

                // Use the existing timestamps
                if (checkExistResult.result.start_time) {
                    startTime = new Date(checkExistResult.result.start_time);
                }

                if (checkExistResult.result.end_time) {
                    endTime = new Date(checkExistResult.result.end_time);
                }
            }
            else {
                const newResult = await resultService.createResult(test.id, userId) || []

                if (newResult) {
                    resultId = newResult.id;
                    if (newResult.start_time) {
                        startTime = new Date(newResult.start_time);
                    }

                    if (newResult.end_time) {
                        endTime = new Date(newResult.end_time);
                    }

                    console.log('Created new result:', resultId);
                } else {
                    console.error('Failed to create a new result');
                    return res.status(500).json({ error: 'Failed to create quiz result' });
                }
            }

            res.render('quiz/doTest', {
                layout: false,
                quiz: test,
                resultId: resultId,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                numberOfQuestions: test.questions.length,
                existingAnswers: answer.length > 0 ? answer : []
            });
        }
        catch (error) {
            console.error('Error fetching quiz details:', error);
            res.status(500).json({ error: 'Failed to fetch quiz details' });
        }
    },

    getQuizzesByCategory: async (req, res) => {
        try {
            const categories = await categoryService.getAllCategories() || []

            const quizzesOfCategory = await Promise.all(categories.map(async (category) => {
                try {
                    const quizzes = await quizService.getQuizzesByCategoryId(category.id) || []
                    return {
                        ...category,
                        quizzes: quizzes.map(quiz => ({
                            triggerLoading: true,
                            id: quiz.id,
                            name: quiz.name,
                            title: quiz.title,
                            description: quiz.description,
                            image: quiz.imageUrl,
                            time: quiz.time,
                            numberOfQuestions: quiz.numberOfQuestions,
                        }))
                    }
                }
                catch (error) {
                    console.error('Error fetching quizzes for category:', error);
                    return null;
                }

            })).then(results => results.filter(result => result !== null && result.quizzes.length > 0));

            res.render('home/categoryPage', {
                layout: 'main',
                quizzesOfCategory
            });
        }
        catch (error) {
            console.error('Error fetching quizzes by category:', error);
            res.status(500).json({ error: 'Failed to fetch quizzes by category' });
        }
    },

    getTestPage: async (req, res) => {
        try {
            res.render('quizzes', {
                layout: "student"
            });
        } catch (error) {
            console.error('Error fetching quizzes:', error);
            res.status(500).json({ error: 'Failed to fetch quizzes' });
        }
    },

    getQuestionPage: async (req, res) => {
        try {
            res.render('questionOfQuiz', {
                layout: "student",
            });
        } catch (error) {
            console.error('Error fetching quizzes:', error);
            res.status(500).json({ error: 'Failed to fetch quizzes' });
        }
    },

    getAddQuestionPage: async (req, res) => {
        try {
            const quizId = parseInt(req.params.id);
            const quiz = await quizService.getQuizById(quizId);

            if (!quiz) {
                return res.status(404).render('error', { message: 'Quiz not found' });
            }

            res.render('addQuestion', {
                layout: false
            });
        } catch (error) {
            console.error('Error loading add question page:', error);
            res.status(500).render('error', { message: 'Failed to load question page' });
        }
    }
};