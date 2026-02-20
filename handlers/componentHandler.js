const fs = require("fs");
const path = require("path");

const getAllComponentFiles = (dirPath, fileArray = []) => {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      fileArray = getAllComponentFiles(filePath, fileArray);
    } else if (file.endsWith(".js")) {
      fileArray.push(filePath);
    }
  });
  return fileArray;
};

module.exports = (client) => {
  client.components = new Map();
  const componentRootFolders = [
    path.join(__dirname, "..", "components", "Components"),
    path.join(__dirname, "..", "components", "Apostas"),
  ];
  let allComponentFiles = [];
  componentRootFolders.forEach((folder) => {
    if (fs.existsSync(folder)) {
      allComponentFiles = [
        ...allComponentFiles,
        ...getAllComponentFiles(folder),
      ];
    }
  });
  const loadedComponentSources = new Map();

  for (const file of allComponentFiles) {
    const componentModule = require(file);
    for (const id in componentModule) {
      if (Object.prototype.hasOwnProperty.call(componentModule, id)) {
        if (client.components.has(id)) {
          const sourceFile = loadedComponentSources.get(id);
          console.warn(
            `[Component Handler] ⚠️ CONFLITO DE ID! "${id}" já está carregado.`
          );
          console.warn(`   - Fonte Original: ${sourceFile}`);
          console.warn(`   - Conflito em:     ${file}`);
        } else {
          client.components.set(id, componentModule[id]);
          loadedComponentSources.set(id, file);
        }
      }
    }
  }

  console.log(`✅ Components carregados: ${client.components.size}`);
};
