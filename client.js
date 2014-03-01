var request = require('request');

module.exports = client;
client.cli = require('./cli');

// Queue for and process one full game.
function client(config, cb) {
    var bot = config.bot;
    var key = config.key;
    var mode = config.mode;
    var log = config.log;
    var context = config.context || {};
    var serverUrl = config.serverUrl || 'http://vindinium.org';
    var signalMaster = config.signalMaster;

    if (typeof(bot) !== 'function')
        throw new Error('bot must be set');
    if (typeof(key) !== 'string')
        throw new Error('key must be set');
    if (mode !== 'arena' && mode !== 'training')
        throw new Error('mode must be set to arena or training');

    // Send the opening request, which puts us in the queue.
    if (log) log('queue');
    var params = { key: key };
    if (mode === 'training') {
        if (config.turns) params.turns = config.turns;
        if (config.map) params.map = config.map;
    }
    gameRequest(serverUrl + '/api/' + mode, params, function(err, state) {
        if (signalMaster) process.send({ type: 'dequeue' });
        if (err) return error(err);
        gameCallback(state);
    });

    // Game request callback, when it's our turn.
    function gameCallback(state) {
        state.context = context;

        if (log && state.game.turn < 4)
            log('start', state);

        if (state.game.finished) {
            if (log) log('end', state);
            return cb(null, state);
        }

        try { bot(state, botCallback); }
        catch (err) { botCallback(err); }

        // Bot callback, when we've decided on a move.
        function botCallback(err, dir) {
            // Make sure we're async to escape try-catch.
            process.nextTick(function() {
                if (err) return error(err);
                if (log) log('turn', state);

                // Short-hands for directions.
                if (!dir) dir = '';
                switch (dir.toLowerCase()) {
                    case 'n': case 'north':
                        dir = 'North'; break;
                    case 'e': case 'east':
                        dir = 'East'; break;
                    case 's': case 'south':
                        dir = 'South'; break;
                    case 'w': case 'west':
                        dir = 'West'; break;
                    default:
                        dir = 'Stay'; break;
                }

                // Send the move.
                var params = { key: key, dir: dir };
                gameRequest(state.playUrl, params, function(err, state) {
                    if (err) error(err); else gameCallback(state);
                });
            });
        }
    }

    // Error helper.
    function error(err) {
        if (log) log('error', err);
        cb(err);
    }
}

// Common request processing.
function gameRequest(url, form, cb) {
    var params = { url: url, form: form };
    var req = request.post(params, function(err, res, body) {
        if (err)
            return cb(err);
        if (res.statusCode !== 200)
            return cb(new Error(res.statusCode + ' ' + body));

        try { body = JSON.parse(body); }
        catch (e) { return cb(e); }

        cb(null, body);
    });

    req.start();
    req.req.setSocketKeepAlive(true, 10000);
}
