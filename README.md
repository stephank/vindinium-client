## vindinium-client

Write a [vindinium.org](http://vindinium.org/) bot in node.js!

BSD licensed.

### Install

    npm install vindinium-client

### Example bot

This guy walks in a random direction each turn:

    var dirs = 'nesw';

    function bot(state, callback) {
        var i = Math.floor(Math.random() * 4);
        var dir = dirs[i];
        callback(dir);
    };

    module.exports = bot;
    if (require.main === module)
        require('vindinium-client').cli(bot);

 - Put this in a new directory somewhere.
 - Make it executable: `chmod a+x bot.js`
 - Install the client here as well: `npm install vindinium-client`
 - Put your key in a JSON file: `echo '{"key":"..."}' > config.json`
 - Run it! `./bot.js -t 1 config.json`

### Directions

For convenience, the callback will accept all of `n`, `north`, `e`, `east`,
`s`, `south`, `w`, `west`. Anything else is interpreted as a 'stay' command.
All of these are case-insensitive.

### Private servers

Private servers are specified in the config JSON.

    { "key": "...", "serverUrl": "http://..." }

### Full CLI usage

Run a single training match on map `m1`:

    ./bot.js -t 1 --map m1 config.json

Run 3 training matches, for 50 turns each:

    ./bot.js -t 3 --turns 50 config.json

Run 8 training matches total, parallel in 2 workers:

    ./bot.js -t 2,8 config.json

Run 20 arena matches, in 4 workers, queue only 1 at the same time:

    ./bot.js -a 1,4,20 config.json

Run arena matches indefinitely, in 4 workers, queuing 1 at a time:

    ./bot.js -a 1,4,INF config.json

At any point, the bot can be interrupted with <kbd>Ctrl</kbd> + <kbd>C</kbd>.
This will finish any running arena matches. Press again to stop immediately.
Training matches are always immediately stopped on interrupt.

The CLI uses forking to do parallel processing. However to make debugging
and profiling easier, requesting just 1 worker won't use the forking code.

### Custom logging

The standard logging is very basic. You can override it using a second
parameter to `cli`:

    require('vindinium-client').cli(bot, function(state) {
        console.log('Turn ' + state.game.turn);
    });

This function is called for each server response (and before the bot).

### State between turns

The state object is what's parsed as-is from the server. However, for each game
an empty object is created, and set on the `context` property of all state
objects for that game. You can use this to track additional state between turns
for a single game.

### Usage from node.js

If you'd like to take manual control, that's possible too:

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

 - `log`: a log function, call after each response, that takes a state object.
 - `context`: an initial context object.
 - `serverUrl`: an alternative server to use.
 - `turns`: the number of turns to play, only for training mode.
 - `map`: the name of the map to play on, only for training mode.
