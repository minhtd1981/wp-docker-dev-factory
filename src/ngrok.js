const { execSync } = require("child_process");
const ngrok = require("ngrok");
const logger = require("./logger");

const runNgrok = async config => {
  process.env.ngrokRunning = true;
  process.env.containerName = config.containerName;

  try {
    execSync(
      `docker exec -i ${config.containerName} sed -i '/all, stop editing!/ a define("WP_SITEURL", "http://" . $_SERVER["HTTP_HOST"]);' /app/wp-config.php`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec -i ${config.containerName} sed -i '/all, stop editing!/ a define("WP_HOME", "http://" . $_SERVER["HTTP_HOST"]);' /app/wp-config.php`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec -i ${config.containerName} wp plugin activate relative-url`,
      { stdio: "inherit" }
    );
  } catch (e) {
    console.log(e)
    logger.warn("SSL is already toggled ON");
  }

  const url = await ngrok.connect({
    addr: config.containerPort,
    region: "jp",
    onStatusChange: status => logger.info(status),
    onLogEvent: data => console.log(data)
  });

  logger.info(`ngrok running at ${url}`);
};

process.on("SIGINT", () => {
  if (!process.env.ngrokRunning) {
    return;
  }

  logger.warn("closing ngrok connection");
  try {
    execSync(
      `docker exec -i ${process.env.containerName} grep 'define("WP_SITEURL"' wp-config.php`,
      { stdio: "inherit" }
    )
    execSync(
      `docker exec -i ${process.env.containerName} sed -i '/^define("WP_HOME"/d' wp-config.php`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec -i ${process.env.containerName} sed -i '/^define("WP_SITEURL"/d' wp-config.php`,
      { stdio: "inherit" }
    );
    execSync(
      `docker exec -i ${process.env.containerName} wp plugin deactivate relative-url`,
      { stdio: "inherit" }
    );
  } catch (e) {
    console.log(e)
    logger.warn("SSL is already toggled OFF");
  }
});

module.exports = runNgrok;
