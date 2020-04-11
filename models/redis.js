const redis = require('redis')
const uuid = require('node-uuid') //生成唯一ID
const poolModule = require('generic-pool') //Redis连接池创建与管理

const pool = poolModule.Pool({
	name: 'redisPool',
	create: function (callback) {
		const client = redis.createClient()
		callback(null, client)
	},
	destroy: function (client) {
		client.quit()
	},
	max: 100,
	min: 5,
	idleTimeoutMillis: 30000
	// 日志打印
	// log: true
})
// 超出次数公共代码
function checkTimes(owner, client, callback) {
	client.INCR(owner, function () {
		client.TTL(owner, function (err, ttl) {
			// 检查当天是否为第一次扔/捡瓶子
			if (ttl === -1) {
				// 是第一次扔/捡，则扔/捡瓶次数键的生命期为1天
				client.EXPIRE(owner, 86400, function () {
					pool.release(client)
				})
			} else {
				// 已扔/捡过瓶子，则保持原有生命期不变
				pool.release(client)
			}
			callback({ code: 1, msg: ttl })
		})
	})
}
// 检查用户是否超出扔瓶次数的限制
function checkThrowTimes(owner, callback) {
	pool.acquire(function (err, client) {
		if (err) {
			return callback({ code: 0, msg: err })
		}
		// 到 2号数据库检查用户是否超过扔瓶次数限制
		client.SELECT(2, function () {
			// 获取该用户的扔瓶次数
			client.GET(owner, function (err, result) {
				if (result >= 10) {
					return callback({ code: 0, msg: '今天扔瓶次数已用完' })
				}
				checkTimes(owner, client, callback)
			})
		})
	})
}
// 扔一个瓶子
function throwOneBottle(bottle, callback) {
	bottle.time = bottle.time || Date.now()
	const bottleId = uuid.v4()
	// const type = {male: 0, female: 1}
	pool.acquire(function (err, client) {
		if (err) {
			return callback({ code: 0, msg: err })
		}
		client.SELECT(bottle.type, function () {
			//           hash, obj, [callback]
			client.HMSET(bottleId, bottle, function (err, result) {
				if (err) {
					return callback({ code: 0, msg: '过会儿再试试吧！' })
				}
				// 设置漂流瓶生存期
				client.PEXPIRE(
					bottleId,
					86400000 + bottle.time - Date.now(),
					function () {
						// 释放连接
						pool.release(client)
					}
				)
				callback({ code: 1, msg: result })
			})
		})
	})
}

// 检查用户是否超出捡瓶次数限制
function checkPickTimes(owner, callback) {
	pool.acquire(function (err, client) {
		if (err) {
			return callback({ code: 0, msg: err })
		}
		// 到 3 号数据库检查用户是否超过捡瓶次数限制
		client.SELECT(3, function () {
			client.GET(owner, function (err, result) {
				if (result >= 10) {
					return callback({ code: 0, msg: '今天捡瓶次数已用完' })
				}
				checkTimes(owner, client, callback)
			})
		})
	})
}
// 捡一个瓶子
function pickOneBottle(info, callback) {
	// info.type = info.type || 'all';
	pool.acquire(function (err, client) {
		if (err) {
			return callback({ code: 0, msg: err })
		}
		// 根据请求瓶子类型到不同数据库中查找
		// 男生: 0, 女生: 1
		let { type } = info
		if (type == 2) {
			type = Math.round(Math.random())
		}
		client.SELECT(type, function () {
			// 随机返回一个漂流瓶 id
			client.RANDOMKEY(function (err, bottleId) {
				if (err) {
					return callback({ code: 0, msg: err })
				}
				if (!bottleId) {
					return callback({ code: 2, msg: '恭喜你捞到一只派大星！' })
				}
				client.HGETALL(bottleId, function (err, bottle) {
					if (err) {
						return callback({ code: 0, msg: '漂流瓶破损了……' })
					}
					// 若被人捡到，则从数据库中删除，以免一瓶多捡
					client.DEL(bottleId, function () {
						pool.release(client)
					})
					callback({ code: 1, msg: bottle })
				})
			})
		})
	})
}

exports.throw = function (bottle, callback) {
	checkThrowTimes(bottle.owner, function (result) {
		if (result.code === 0) {
			return callback(result)
		}
		throwOneBottle(bottle, function (result) {
			callback(result)
		})
	})
}

exports.pick = function (info, callback) {
	checkPickTimes(info.user, function (result) {
		if (result.code === 0) {
			return callback(result)
		}
		// 20%概率捡到海星
		if (Math.random() <= 0.2) {
			return callback({ code: 2, msg: '恭喜你捞到一只派大星！' })
		}
		pickOneBottle(info, function (result) {
			callback(result)
		})
	})
}
