var fs = require("fs-extra");
var path = require("path");
var commander = require("commander");
var marked = require("marked");
var highlightjs = require("highlight.js");
var esprima = require("esprima");
var mustache = require("mustache");

var defaults = {
    "output": "docs",
    "css": path.join(__dirname, "resources", "style.css")
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
    //Recursive mkdir to output path
    fs.mkdirs(options.output, function () {
        var files = options.args.slice();

        //Process each file one by one
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

                fs.copySync(options.css, path.join(options.output, path.basename(options.css)));
                fs.copySync(path.join(__dirname, "resources", "public"), path.join(options.output, "public"));

                if (callback) {
                    callback(source);
                }
            });
        };

        nextFile();
    });
};

parse = function (source, code, options) {
    //Get multi-line block comments from AST
    var ast = esprima.parse(code, {"loc": true, "comment": true});
    var comments = ast.comments.filter(function (el) {
        var lines = el.value.split("\n");
        return el.type === "Block" && lines.length > 2 && lines[0].match(/^\*\s*$/);
    });
    var lines = code.split("\n");

    if (comments.length === 0) {
        return [{"code": lines.join("\n")}];
    }

    var sections = [], section = {}, line = 0, comment, start, end;

    var stripPrefix = function (val) {
        return val.replace(/^\s*\*/, "");
    };

    //Loop through each comment block and get the associated code
    do {
        comment = comments.shift();
        start = comment.loc.start.line - 1;
        end = comment.loc.end.line - 1;

        if (line !== start) {
            section.code = lines.slice(line, start).join("\n");
            line = start;

            sections.push(section);
            section = {};
        }

        section.comment = lines.slice(line + 1, end).map(stripPrefix).join("\n");
        line = end + 1;
    } while (comments.length > 0);

    if (line < lines.length) {
        section.code = lines.slice(line, lines.length).join("\n");
    }

    sections.push(section);
    return sections;
};

format = function (source, sections, options) {
    for (var i = 0; i < sections.length; ++i) {
        //Format code with highlightjs
        if (sections[i].code) {
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
        "sections": sections,
        "css": path.basename(options.css),
        "sources": options.args.map(function (val) {
            return path.basename(val, path.extname(val));
        })
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
        .option("-c, --css [file]", "use a custom css file", defaults.css)
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
