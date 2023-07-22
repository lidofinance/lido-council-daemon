const { Parser } = require('stream-json');
const { pick }   = require('stream-json/filters/Pick');
const { createReadStream, createWriteStream, existsSync } = require('fs');
const StreamValues = require('stream-json/streamers/StreamValues');
const StreamArray = require('stream-json/streamers/StreamArray');
const JSONStream = require('JSONStream');
const { glob } = require('glob');

/**
 * @typedef Header
 *
 */


/**
 * @typedef Event
 *
 */

/**
 *
 * @param {string} filePath
 * @return {Promise<{ events: Event[]; header: Header }>}
 */
const readFileAsStream = async (filePath)  => {

  const fileStream = createReadStream(filePath, 'utf-8')
    .pipe(Parser.make());

  /**
   * @type {Promise<Event[]>}
   */
  const eventsPromise = new Promise(
    (resolve, reject) => {
    /**
     * @type {Event[]}
     */
    const events = [];

    fileStream
      .pipe(pick({ filter: 'events' }))
      .pipe(StreamArray.make())
      .on('data', (eventsBatch) => {
        //console.log(eventChunk);
        //events.push(...eventChunk.value.map(v => v.value));
        events.push(eventsBatch.value);
      })
      .on('end', () => {
        //console.log('end');
      })
      .on('finish', () => {
        //console.log('finish');
      })
      .on('close', () => {
        //console.log('close');
        resolve(events);
      })
      .on('error', (error) => {
        reject(error);
      });
  });

  /**
   * @type {Promise<Header>}
   */
  const headersPromise = new Promise(
    (resolve, reject) => {
      /**
       * @type {Header}
       */
      let headers = {};

      fileStream
        .pipe(pick({ filter: 'headers' }))
        .pipe(StreamValues.make())
        .on('data', (data, i) => {
          headers = data.value;
        })
        .on('finish', () => {
          //console.log('finish');
        })
        .on('end', () => {
          //console.log('end');
        })
        .on('close', () => {
          //console.log('close');
          resolve(headers);
        })
        .on('error', (error) => {
          reject(error);
        });
    });

  const [ events, header ] = await Promise.all([eventsPromise, headersPromise]);

  return { header, events };
}

/**
 *
 * @param {string} filePath
 * @param {Header} headers
 * @param {Event[]} events
 * @param {any} data
 */
const writeFileAsStream = (filePath, headers, events)  => {

  return new Promise((resolve, reject) => {
    const jsonStream = JSONStream.stringify(
      '{ "headers": ' + JSON.stringify(headers) + ', "events": [',
      ',',
      ']}',
    );

    const chunkify = (array, chunkSize) => {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        // do whatever
        chunks.push(chunk);
      }

      return chunks;
    }

    const fileStream = createWriteStream(filePath);

    const writeFileStream = jsonStream.pipe(fileStream);

    const chunks = chunkify(events, 10000);

    let i = 0;
    for (const eventChunk of chunks) {
      jsonStream.write(eventChunk);
      i++;
    }

    jsonStream.on('end', () => {
      console.log('jsonStream end');
    });

    writeFileStream.on('end', () => {
      console.log('write end');
    });

    writeFileStream.on('close', () => {
      console.log('write close');
      resolve();
    });

    writeFileStream.on('error', (err) => {
      reject(err);
    })

    jsonStream.end();
  });

}

/**
 *
 * @param {string} fileMask
 * @return {Promise<string[]>}
 */
const getFilesByMask = (fileMask) => {
  return new Promise((resolve, reject) => {
    glob(fileMask, { debug: true }, (err, files)=> {
      if (err) {
        return reject(err);
      }
      return resolve(files);
    });
  });

}

const readFilesAsStream  = async (fileMask) => {
  const files = await getFilesByMask(fileMask);

  console.log('files', files);

}


(async function main() {

  //console.log(__dirname);

  //await readFilesAsStream(__dirname + '/*.json');

  console.time('read');
  //const res = await readFileAsStream('/home/infloop/Documents/deposit.events.json');
  //const res = await readFileAsStream('./original-deposit.events.json');
  const res = await readFileAsStream('./chunks-deposit.events.json');
  console.timeEnd('read');

  const events = res.events.flat();

  console.log(events.length, res.header);
  //console.log(events[0]);
  //console.log(events[res.events.length - 1]);
  console.log('hasArrayIn', events.some(i => Array.isArray(i)));

  console.time('write');
  //await writeFileAsStream('./chunks-deposit.events.json', res.header, events);
  console.timeEnd('write');


})().catch(e => console.error(e));
