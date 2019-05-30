/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *  Copyright (c) 2015 Thomas Brouard (for codes from Abricotine)
 *
 *  Moeditor is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Moeditor is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Moeditor. If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

const fs = require('fs'),
    mime = require('mime');

// const lineSeparators=['\r\n','\r'];
// let fileLineSeparators={};

// function normalizeLineEndings(str) {
//     if (!str) return str;
//     return str.replace(/\r\n|\r/g, '\n');
// }
// function restoreLineEndings(fileName,str) {
//     if (!str) return str;
//
//     let sep=fileLineSeparators[fileName]
//     if(sep===undefined){return str;}
//
//     return str.replace(/\n/g,sep);
// }

class MoeditorFile {
    static isFile(fileName) {
        try {
            return fs.statSync(fileName).isFile();
        } catch (e) {
            return false;
        }
    }

    static isTextFile(fileName) {
        try {
            if (!fs.statSync(fileName).isFile()) return false;
            var type = mime.lookup(fileName);
            return type && type.substr(0, 4) === 'text';
        } catch (e) {
            return false;
        }
    }

    static isDirectory(fileName) {
        try {
            return fs.lstatSync(fileName).isDirectory();
        } catch (e) {
            return false;
        }
    }

    static read(fileName, empty) {
        try {
            // for(let i in lineSeparators){
            //     let sep=lineSeparators[i];
            //     if(content.indexOf(sep)>=0){
            //         fileLineSeparators[fileName]=sep;break;
            //     }
            // }
            // return normalizeLineEndings(content);
            return fs.readFileSync(fileName,"utf8");
        } catch(e) {
            return empty;
        }
    }

    static write(fileName, content) {
        // content=restoreLineEndings(fileName,content)
        return fs.writeFileSync(fileName, content);
    }

    static writeAsync(fileName, content, cb) {
        // content=restoreLineEndings(fileName,content)
        return fs.writeFile(fileName, content, cb);
    }

    static remove(fileName) {
        try {
            fs.unlinkSync(fileName);
        } catch(e) {
            ;
        }
    }
}

module.exports = MoeditorFile;