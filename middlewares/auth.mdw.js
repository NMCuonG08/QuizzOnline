export default  function (req, res,next) {
    if(req.session.auth === false){
      req.session.retUrl = req.originalUrl;
      return res.redirect('/auth/login');
    }
    next();
}