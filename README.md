## vindinium-client

Write a [vindinium.org](http://vindinium.org/) bot in node.js!

### Install

    npm install vindinium-client

### Example bot

This guy walks in a random direction each turn:

    var dirs = 'nesw';

    function bot(state, callback) {
        var i = Math.floor(Math.random() * 4);
        var dir = dirs[i];
        callback(null, dir);
    };

    module.exports = bot;
    if (require.main === module)
        require('vindinium-client').cli(bot);

 - Put this in a new directory somewhere.
 - Make it executable: `chmod a+x bot.js`
 - Install the client here as well: `npm install vindinium-client`
 - Put your key in a JSON file: `echo '{"key":"..."}' > config.json`
 - Run it! `./bot.js -t 1 config.json`

### The bot function

The bot function signature is `(state, callback)`.

The state object is what's parsed as-is from the server.

However, for each game an empty object is created, and set on the `context`
property of all state objects for that game. You can use this to track
additional state between turns for a single game.

The callback signature is `(error, direction)`.

Errors abort the game. The bot function is also executed within a try-catch, so
that errors thrown by non-asynchronous bots are also handled.

For convenience, all of `n`, `north`, `e`, `east`, `s`, `south`, `w`, and
`west` are acceptable directions. These are also case-insensitive. Anything
else is interpreted as a 'stay' command.

### Full CLI usage

Run a single training match on map `m1`:

    ./bot.js -t 1 --map m1 config.json

Run 3 training matches, for 50 turns each:

    ./bot.js -t 3 --turns 50 config.json

Run 8 training matches total, parallel in 2 workers:

    ./bot.js -t 2,8 config.json

Run 20 arena matches, in 4 workers, queue only 1 at the same time:

    ./bot.js -a 1,4,20 config.json

Run arena matches indefinitely, in 4 workers, queuing 2 at a time:

    ./bot.js -a 2,4,INF config.json

Same as above, but queue in groups of 2. This is to attempt team strategies,
but the game offers no guarantee that you'll actually end up in the same game.

    ./bot.js -a 2,2,4,INF config.json

At any point, the bot can be interrupted with <kbd>Ctrl</kbd> + <kbd>C</kbd>.
This will finish any running arena matches. Press again to stop immediately.
Training matches are always immediately stopped on interrupt.

The CLI uses forking to do parallel processing. However to make debugging
and profiling easier, a single worker won't use the forking code.

Errors currently do not stop the CLI from queuing more games. (This will likely
change in the future.)

### Private servers

Private servers are specified in the config JSON.

    { "key": "...", "serverUrl": "http://..." }

### Custom logging

The standard logging is very basic. You can override it using a second
parameter to `cli`:

    var cli = require('vindinium-client');
    cli(bot, function(ev, arg) {
        if (ev === 'turn')
            console.log('Turn ' + arg.game.turn);
        else
            cli.defaultLog(ev, arg);
    });

The function is called on several events:

 - `queue`: Called right before the first request. This request may take a
   while until enough players are in the server queue to start a match. `arg`
   is empty.

 - `start`: The game has started. Called before the bot function. `arg` is the
   first state from the server.

 - `turn`: Called after the bot function, and before the next request. `arg` is
   the current state.

 - `end`: The game has ended. `arg` is the last state from the server.

 - `error`: An error has occurred. `arg` is the error.

In addition, the CLI adds the following events:

 - `graceful`: The user interrupted the bot, and it is gracefully finishing
   running arena matches. (A second interrupt will abort matches.)

 - `abort`: The user interrupted the bot, and running matches were aborted.

The `cli.defaultLog` method is the default logging function, and can be called
as a fallback, if you only wish to override certain events. There's also
`cli.ranking(state)`, which generates just the ranking string (`WIN - P1 ...`)
used in the default logger.

### Usage from node.js

If you'd like to take manual control, that's possible too. The main export of
`vindinium-client` is a function to run a single game:

    var vindinium = require('vindinium-client');

    function bot(state, cb) {
        /* ... */
    });

    vindinium({
        key: '...',
        bot: bot,
        mode: 'arena',  // or 'training'
    }, function(err, lastState) {
        /* ... */
    });

The above parameters are required. Additional optional parameters are:

 - `log`: a log function taking state, called after each response.
 - `context`: an initial context object.
 - `serverUrl`: an alternative server to use.
 - `turns`: the number of turns to play, only for training mode.
 - `map`: the name of the map to play on, only for training mode.

### Credit

Based on [ozten/vindinium-starter-nodejs](https://github.com/ozten/vindinium-starter-nodejs)

[BSD licensed](http://en.wikipedia.org/wiki/BSD_licenses#3-clause_license_.28.22Revised_BSD_License.22.2C_.22New_BSD_License.22.2C_or_.22Modified_BSD_License.22.29).
