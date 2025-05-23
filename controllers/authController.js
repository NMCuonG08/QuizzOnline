import userService from '../services/userService.js';
import authService from '../services/authService.js';

export default {
    // Render login page
    renderLoginPage: (req, res) => {
        if (req.headers.referer && !req.headers.referer.includes('/login')) {
            req.session.retUrl = req.headers.referer;
        }
        
        // Get flash messages
        const errorMessage = req.flash('errorMessage')[0];
        const successMessage = req.flash('successMessage')[0];
        const sweetAlert = req.flash('sweetAlert')[0];
        
        res.render('pages/login_page', {
            layout: false,
            errorMessage,
            successMessage,
            sweetAlert
        });
    },

    // Facebook login callback
    loginToFacebook: async (req, res) => {
        try {
            const user = await userService.createAccountForUser(req.user, 'FACEBOOK');
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.auth = true;
            req.session.authUser = user;
            const currentDate = new Date();
            const expiryDate = new Date(user.subscription_expiry);
            req.session.is_premium = expiryDate > currentDate;
            const retUrl = req.session.retUrl || '/';
            delete req.session.retUrl;
            res.redirect(retUrl);
        } catch (error) {
           req.flash('sweetAlert', JSON.stringify({
               type: 'error',
               title: 'Login Failed',
               text: 'Error during Facebook login'
           }));
           res.redirect('/auth/login');
        }
    },

    // Handle regular login
    handleLogin: async (req, res) => {
        const email = req.body.login_email || '';
        const password = req.body.login_password || '';
        
        try {
            const user = await authService.login(email, password); 
            if (!user) {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'error',
                    title: 'Login Failed',
                    text: 'Invalid email or password'
                }));
                return res.redirect('/auth/login');
            }
            
            req.user = user;
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.auth = true;
            req.session.authUser = user;
            
            const currentDate = new Date();
            const expiryDate = new Date(user.subscription_expiry);
            req.session.is_premium = expiryDate > currentDate;
      
            // Get return URL from session and redirect
            const returnTo = req.session.retUrl || '/';
            delete req.session.retUrl;
            return res.redirect(returnTo);
        } catch (error) {
            console.error('Error logging in:', error);
            
            // Check if the error is about unverified account
            if (error.message && error.message.includes('Account not verified')) {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'warning',
                    title: 'Verification Required',
                    text: 'Account not verified. Please check your email for verification link.'
                }));
            } else {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'error',
                    title: 'Error',
                    text: 'Internal server error'
                }));
            }
            
            return res.redirect('/auth/login');
        }
    },

    // Handle user registration
    handleSignup: async (req, res) => {
        const email = req.body.reg_email || '';
        const password = req.body.reg_password || '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
            req.flash('sweetAlert', JSON.stringify({
                type: 'warning',
                title: 'Invalid Email',
                text: 'Please enter a valid email address'
            }));
            return res.redirect('/auth/login');
        }
        
        const token = req.body['h-captcha-response'];
        if (!token) {
            req.flash('sweetAlert', JSON.stringify({
                type: 'warning',
                title: 'Captcha Required',
                text: 'Please complete the captcha verification'
            }));
            return res.redirect('/auth/login');
        }
      
        try {
            // Create account with verification flag set to false
            const result = await authService.createAccountWithVerification(email, password);
      
            if (result.existingUser) {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'warning',
                    title: 'Account Exists',
                    text: 'Account already exists. Please log in.'
                }));
                return res.redirect('/auth/login'); 
            }
            
            req.flash('sweetAlert', JSON.stringify({
                type: 'success',
                title: 'Success!',
                text: 'Account created successfully. Please check your email to verify your account.'
            }));
            return res.redirect('/auth/login'); 
      
        } catch (error) {
            console.error('Error during signup:', error);
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Error',
                text: 'Internal server error'
            }));
            return res.redirect('/auth/login');
        }
    },

    // Resend verification email
    resendVerification: async (req, res) => {
        const { email } = req.body;
        
        if (!email) {
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Email Required',
                text: 'Please provide your email address.'
            }));
            return res.redirect('/auth/login');
        }
        
        try {
            const result = await authService.resendVerificationEmail(email);
            
            if (result.success) {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'success',
                    title: 'Email Sent',
                    text: 'Verification email has been resent. Please check your inbox.'
                }));
            } else {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'error',
                    title: 'Failed',
                    text: result.message || 'Could not resend verification email.'
                }));
            }
        } catch (error) {
            console.error('Error resending verification email:', error);
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Error',
                text: 'Failed to resend verification email.'
            }));
        }
        
        return res.redirect('/auth/login');
    },

    // Verify email with token
    verifyEmail: async (req, res) => {
        const verificationToken = req.params.token;
        
        try {
            const result = await authService.verifyUserEmail(verificationToken);
            
            if (result.success) {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'success',
                    title: 'Email Verified',
                    text: 'Your account has been successfully verified. You can now log in.'
                }));
            } else {
                req.flash('sweetAlert', JSON.stringify({
                    type: 'error',
                    title: 'Verification Failed',
                    text: result.message || 'Invalid or expired verification link.'
                }));
            }
            
            return res.redirect('/auth/login');
        } catch (error) {
            console.error('Error verifying email:', error);
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Error',
                text: 'Failed to verify email. Please try again.'
            }));
            return res.redirect('/auth/login');
        }
    },

    // Google login callback
    loginToGoogle: async (req, res) => {
        try {
            const user = await userService.createAccountForUser(req.user, 'google');
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.auth = true;
            req.session.authUser = user;
            const currentDate = new Date();
            const expiryDate = new Date(user.subscription_expiry);
            req.session.is_premium = expiryDate > currentDate;
           
            const retUrl = req.session.retUrl || '/';
            delete req.session.retUrl;
            return res.redirect(retUrl);
        } catch (error) {
            console.error('Error during Google login:', error);
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Login Failed',
                text: 'Error during Google login'
            }));
            return res.redirect('/auth/login');
        }
    },

    // GitHub login callback
    loginToGithub: async (req, res) => {
        try {
            const user = await userService.createAccountForUser(req.user, 'github');
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.auth = true;
            req.session.authUser = user;
            const currentDate = new Date();
            const expiryDate = new Date(user.subscription_expiry);
            req.session.is_premium = expiryDate > currentDate;
            const retUrl = req.session.retUrl || '/';
            delete req.session.retUrl;
            return res.redirect(retUrl);
        } catch (error) {
            req.flash('sweetAlert', JSON.stringify({
                type: 'error',
                title: 'Login Failed',
                text: 'Error during GitHub login'
            }));
            return res.redirect('/auth/login');
        }
    },

    // Update password
    handleUpdatePassword: async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.session.authUser.id;
      
            // Call service method that handles all password verification and updating
            const result = await authService.updatePassword(userId, currentPassword, newPassword);
            
            if (result.success) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'Password updated successfully' 
                });
            } else {
                return res.status(401).json({ 
                    success: false, 
                    message: result.message || 'Failed to update password' 
                });
            }
        } catch (error) {
            console.error('Error updating password:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Internal server error' 
            });
        }
    },

    // Logout
    handleLogout: (req, res, next) => {
        req.logout(function(err) {
            if (err) { return next(err); }
            
            // Xóa toàn bộ session
            req.session.destroy((err) => {
                if (err) {
                    return next(err);
                }
                res.clearCookie('connect.sid');
                
                res.redirect(req.headers.referer || '/');
            });
        });
    }
};