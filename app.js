const express = require('express')
const path = require('path')
const favicon = require('serve-favicon')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const session = require('express-session')
const sessionStore = require('connect-mongo')(session)
const routes = require('./routes/index')

const app = express()

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// uncomment after placing your favicon in /public
app.use(favicon(__dirname + '/public/images/favicon.ico'))
app.use(logger('dev'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(
	session({
		secret: 'drifter',
		store: new sessionStore({
			url: 'mongodb://localhost/drifter',
			unterval: 120000
		}),
		cookie: { maxAge: 1000 * 60 * 30 },
		resave: true,
		saveUninitialized: true
	})
)
app.use(express.static(path.join(__dirname, 'public')))

// routes handler
routes(app)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	var err = new Error('Not Found')
	err.status = 404
	next(err)
})

// 开发环境下的错误反馈
if (app.get('env') === 'development') {
	app.use(function (err, req, res, next) {
		res.status(err.status || 500)
		res.render('error', {
			message: err.message,
			error: err
		})
	})
}

// 生产环境下的错误反馈
app.use(function (err, req, res, next) {
	res.status(err.status || 500)
	res.render('error', {
		message: err.message,
		error: {}
	})
})

module.exports = app
