/**!
 * Original file: https://github.com/MinhasKamal/DownGit/blob/master/app/home/down-git.js
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import JSZip from "jszip";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * @typedef {{url:string, fileName?:string, rootDirectory?:string}} Parameter
 * @typedef {{isProcessing?:boolean, downloadedFiles?:number, totalFiles?:number}} Progress
 * @typedef {ReturnType<parseInfo>} RepoInfo
 * @typedef {Array<{path:string, data:any}>} Files
 * @typedef {Array<Promise<any>>} RequestedPromises
 */

/**
 * @param {Parameters<downloadFilesFromGithub>[0]} options 
 * @returns 
 */
const parseInfo = (options) => {
    const repoPath = new URL(options.url).pathname;
    const splitPath = repoPath.split("/");

    const repoInfo = {
        author: "",
        repository: "",
        branch: "",
        rootName: "",
        resPath: "",
        urlPrefix: "",
        urlPostfix: "",
        downloadFileName: "",
        rootDirectoryName: ""
    };

    repoInfo.author = splitPath[1];
    repoInfo.repository = splitPath[2];
    repoInfo.branch = splitPath[4];

    repoInfo.rootName = splitPath[splitPath.length - 1];
    if (!!splitPath[4]) {
        repoInfo.resPath = repoPath.substring(
            repoPath.indexOf(splitPath[4]) + splitPath[4].length + 1
        );
    }
    repoInfo.urlPrefix = "https://api.github.com/repos/" +
        repoInfo.author + "/" + repoInfo.repository + "/contents/";
    repoInfo.urlPostfix = "?ref=" + repoInfo.branch;

    if (!options.fileName || options.fileName == "") {
        repoInfo.downloadFileName = repoInfo.rootName;
    } else {
        repoInfo.downloadFileName = options.fileName;
    }

    if (options.rootDirectory == "false") {
        repoInfo.rootDirectoryName = "";

    } else if (!options.rootDirectory || options.rootDirectory == "" ||
        options.rootDirectory == "true") {
        repoInfo.rootDirectoryName = repoInfo.rootName + "/";

    } else {
        repoInfo.rootDirectoryName = options.rootDirectory + "/";
    }

    return repoInfo;
}

/**
 * @param {Progress} progress 
 * @param {RepoInfo} repoInfo 
 * @param {boolean} uncompress 
 */
const downloadDir = (progress, repoInfo, uncompress) => {
    progress.isProcessing = true;

    const dirPaths = [];
    const files = [];
    const requestedPromises = [];

    dirPaths.push(repoInfo.resPath);
    mapFileAndDirectory(dirPaths, files, requestedPromises, progress, repoInfo, uncompress);
}

/**
 * @param {Array<string>} dirPaths 
 * @param {Files} files 
 * @param {RequestedPromises} requestedPromises 
 * @param {Progress} progress 
 * @param {RepoInfo} repoInfo 
 * @param {boolean} uncompress
 */
const mapFileAndDirectory = (dirPaths, files, requestedPromises, progress, repoInfo, uncompress) => {
    axios.get(repoInfo.urlPrefix + dirPaths.pop() + repoInfo.urlPostfix).then((response) => {
        for (let i = response.data.length - 1; i >= 0; i--) {
            if (response.data[i].type == "dir") {
                dirPaths.push(response.data[i].path);

            } else {
                if (response.data[i].download_url) {
                    getFile(response.data[i].path,
                        response.data[i].download_url,
                        files, requestedPromises, progress
                    );
                } else {
                    console.log(response.data[i]);
                }
            }
        }

        if (dirPaths.length <= 0) {
            downloadFiles(files, requestedPromises, progress, repoInfo, uncompress);
        } else {
            mapFileAndDirectory(dirPaths, files, requestedPromises, progress, repoInfo, uncompress);
        }
    });
}

/**
 * @param {Files} files 
 * @param {RequestedPromises} requestedPromises 
 * @param {Progress} progress 
 * @param {RepoInfo} repoInfo 
 * @param {boolean} uncompress 
 */
const downloadFiles = (files, requestedPromises, progress, repoInfo, uncompress) => {
    const zip = new JSZip();
    Promise.all(requestedPromises).then(() => {
        if (uncompress) {
            for (let i = files.length - 1; i >= 0; i--) {
                const content = repoInfo.rootDirectoryName + files[i].path.substring(decodeURI(repoInfo.resPath).length + 1);
                if (!fs.existsSync(path.dirname(content))) {
                    fs.mkdirSync(path.dirname(content), { recursive: true });
                }
                fs.writeFileSync(content, files[i].data);
            }
            progress.isProcessing = false;
        } else {
            for (let i = files.length - 1; i >= 0; i--) {
                zip.file(
                    repoInfo.rootDirectoryName + files[i].path.substring(decodeURI(repoInfo.resPath).length + 1),
                    files[i].data
                );
            }

            progress.isProcessing = false;
            zip.generateAsync({ type: "uint8array" }).then((content) => {
                fs.writeFileSync(repoInfo.downloadFileName + ".zip", content);
            });
        }
    });
}

/**
 * @param {string} path 
 * @param {string} url 
 * @param {Files} files 
 * @param {RequestedPromises} requestedPromises 
 * @param {Progress} progress 
 */
const getFile = (path, url, files, requestedPromises, progress) => {
    const promise = axios.get(url, { responseType: "arraybuffer" }).then((file) => {
        files.push({ path: path, data: file.data });
        progress.downloadedFiles = files.length;
    }).catch((error) => {
        console.log(error);
    });

    requestedPromises.push(promise);
    progress.totalFiles = requestedPromises.length;
}

/**
 * @param {string} url 
 * @param {Progress} progress 
 * @param {RepoInfo} repoInfo 
 * @param {boolean} uncompress
 */
const downloadFile = (url, progress, repoInfo, uncompress) => {
    progress.isProcessing = true;
    progress.downloadedFiles = 0;
    progress.totalFiles = 1;

    axios.get(url, { responseType: "arraybuffer" }).then((file) => {
        progress.downloadedFiles = 1;
        if (uncompress) {
            progress.isProcessing = false;
            fs.writeFileSync(repoInfo.downloadFileName + ".zip", file.data);
        } else {
            const zip = new JSZip();
            zip.file(repoInfo.rootName, file.data);

            progress.isProcessing = false;
            zip.generateAsync({ type: "uint8array" }).then((content) => {
                fs.writeFileSync(repoInfo.downloadFileName + ".zip", content);
            });
        }
    }).catch((error) => {
        console.log(error);
        progress.isProcessing = false;
    });
}

/**
 * @param {{uncompress?:boolean, token?:string, proxy?:string} & Parameter} options
 * @param {Progress} progress 
 */
const downloadFilesFromGithub = (options, progress = {}) => {
    if (options.proxy) {
        axios.defaults.httpsAgent = new HttpsProxyAgent(options.proxy);
    }

    axios.interceptors.request.use((config) => {
        if (options.token) {
            config.headers.Authorization = `token ${options.token}`;
        }
        return config;
    }, (error) => {
        return Promise.reject(error);
    });

    const repoInfo = parseInfo(options);

    if (!repoInfo.resPath || repoInfo.resPath == "") {
        if (!repoInfo.branch || repoInfo.branch == "") {
            repoInfo.branch = "master";
        }

        const downloadUrl = "https://github.com/" + repoInfo.author + "/" +
            repoInfo.repository + "/archive/" + repoInfo.branch + ".zip";

        downloadFile(downloadUrl, progress, repoInfo, false);

    } else {
        axios.get(repoInfo.urlPrefix + repoInfo.resPath + repoInfo.urlPostfix).then((response) => {
            if (response.data instanceof Array) {
                downloadDir(progress, repoInfo, options.uncompress);
            } else {
                downloadFile(response.data.download_url, progress, repoInfo, options.uncompress);
            }

        }).catch((error) => {
            console.log(error);
        });
    }
}

export { downloadFilesFromGithub };
export default downloadFilesFromGithub;
