var fs = require("fs-extra");
var path = require("path");
var commander = require("commander");
var marked = require("marked");
var highlightjs = require("highlight.js");
var esprima = require("esprima");
var mustache = require("mustache");

var defaults = {
    "output": "docs"
};

marked.setOptions({
    "smartypants": true,
    "breaks": true,
    "highlight": function (code) {
        return highlightjs.highlight("javascript", code).value;
    }
});

var version = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version;

var read, parse, format, write, run;

read = function (options, callback) {
    fs.mkdirs(options.output, function () {
        var files = options.args.slice();

        var nextFile = function () {
            var source = files.shift();
            fs.readFile(source, function (err, buf) {
                if (err) {
                    return callback(err);
                }

                var code = buf.toString();
                var sections = parse(source, code, options);
                format(source, sections, options);
                write(source, sections, options);

                if (files.length > 0) {
                    return nextFile();
                }

                if (callback) {
                    callback();
                }
            });
        };

        nextFile();
    });
};

parse = function (source, code, options) {
    var ast = esprima.parse(code, {"loc": true, "comment": true});
    var comments = ast.comments.filter(function (el) {
        var lines = el.value.split("\n");
        return el.type === "Block" && lines.length > 2;
    });
    var lines = code.split("\n");

    if (comments.length === 0) {
        return {"code": lines.join("\n")};
    }

    var sections = [], section = {}, line = 0, comment, start, end;

    do {
        comment = comments.shift();
        start = comment.loc.start.line;
        end = comment.loc.end.line;

        section.code = lines.slice(line, start - 1).join("\n");
        line = start;

        sections.push(section);
        section = {};

        section.comment = lines.slice(line, end - 1).join("\n");
        line = end;
    } while (comments.length > 0);

    if (line < lines.length) {
        section.code = lines.slice(line, lines.length).join("\n");
    }

    sections.push(section);
    return sections;
};

format = function (source, sections, options) {
    for (var i = 0; i < sections.length; ++i) {
        if (sections[i].code) {
            //Format code with highlightjs
            var code = highlightjs.highlight("javascript", sections[i].code).value;
            code = code.replace(/\s+$/, "");
            sections[i].code = '<div class="highlight"><pre>' + code + '</pre></div>';
        }

        //Format comments with marked
        if (sections[i].comment) {
            sections[i].comment = marked(sections[i].comment);
        }
    }

    return sections;
};

write = function (source, sections, options) {
    var destination = path.join(options.output, path.basename(source, path.extname(source)) + ".html");

    var dir = path.join(__dirname, "resources", "template.html");
    var template = fs.readFileSync(dir).toString();
    var html = mustache.render(template, {
        "title": source,
        "sections": sections
    });

    return fs.writeFileSync(destination, html);
};

run = function (args) {
    if (!args) {
        args = process.argv;
    }

    commander.version(version)
        .usage("[options] files")
        .option("-o, --output [path]", "output to a given folder", defaults.output)
        .parse(args)
        .name = "dakka";

    if (commander.args.length) {
        read(commander);
    } else {
        return console.log(commander.helpInformation());
    }
};

module.exports = {
    "run": run,
    "version": version
};
