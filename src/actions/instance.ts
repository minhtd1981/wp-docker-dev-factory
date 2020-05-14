import { FinalInstanceConfig } from '../types';
import { execSync } from 'child_process';
import { _ } from "lodash";
import makeContainers from './dbcontainers';
import logger from '../logger';

const runContainer = function (config: FinalInstanceConfig): void {
  makeContainers(config);

  const {
    locale,
    instanceName,
    networkname,
    containerName,
    containerPort,
    dockerBridgeIP,
    alreadyInstalled,
    ftp,
    ssh,
  } = config;

  let volumes = config.volumes;
  let { downloadPlugins } = config;
  downloadPlugins = [...downloadPlugins, 'relative-url'];
  const dplugins = `--env PLUGINS="${downloadPlugins.join(' ')}"`;

  const envvars = Object.keys(config.envvars).map((key) => {
    return `--env ${key}=${config.envvars[key]}`;
  });
  const envs = envvars.join(' ');

  // on Windows, strings have to be escaped which is why we need to invoke JSON.stringify twice...
  const isWin = process.platform === "win32"

  let ftpenv = '';
  if (ftp) {
    ftpenv = `--env FTP_CONFIGS=${isWin ? JSON.stringify(JSON.stringify(ftp)).trim() : JSON.stringify(ftp)}`;
  }

  let sshenv = '';
  if (ssh) {
    const sshCopy = _.cloneDeep(ssh)
    const keyPathVolumes = sshCopy.map(
      ({ privateKeyPath, privateKeyFilename }, index) =>
        {
          // remove since Windows paths break JSON
          delete ssh[index].privateKeyPath;
          return `-v ${privateKeyPath}:/app/ssh/${privateKeyFilename}`
        },
    );
    
    sshenv = `--env SSH_CONFIGS=${isWin ? JSON.stringify(JSON.stringify(ssh)).trim() : JSON.stringify(ssh)}`;
    volumes = [...volumes, ...keyPathVolumes];
  }

  volumes = [...volumes, `-v ${config.topdir}/initwp.sh:/docker-entrypoint-initwp.d/initwp.sh`];
  volumes = [...volumes, `-v ${config.topdir}/redump.php:/app/redump.php`];
  volumes = [...volumes, `-v ${config.topdir}/get_active_plugins.php:/app/get_active_plugins.php`];
  volumes = [...volumes, `-v ${config.workingdir}/dumpfiles:/app/dumpfiles`];
  const v = volumes.join(' ');

  try {
    execSync(
      `docker run -d --name=${containerName} -p ${containerPort}:80 \
        --cap-add=SYS_ADMIN \
        --device=/dev/fuse \
        --security-opt apparmor=unconfined \
        ${v} \
        ${dplugins} \
        ${envs} \
        ${sshenv} \
        ${ftpenv} \
        --env XDEBUG_CONFIG=remote_host="${dockerBridgeIP.trim()}" \
        --env AVC_NODE_ENV=development \
        --env DOCKER_BRIDGE_IP="${dockerBridgeIP.trim()}" \
        --env DOCKER_CONTAINER_PORT=${containerPort} \
        --env INSTANCE_NAME=${instanceName} \
        --env ALREADY_INSTALLED_PLUGINS=${isWin ? JSON.stringify(JSON.stringify(alreadyInstalled)).trim() : JSON.stringify(alreadyInstalled)} \
        --env WP_LOCALE=${locale} \
        --env WP_DEBUG=1 \
        --env WP_DEBUG_DISPLAY=1 \
        --env DB_HOST=aivec_wp_mysql \
        --env DB_USER=root \
        --env DB_PASS=root \
        --env URL_REPLACE="http://localhost:${containerPort}" \
        --network=${networkname}_default \
        wordpress_devenv_visiblevc`,
      { stdio: 'inherit' },
    );
  } catch (e) {
    console.log(e);
    logger.error('Something went wrong :(');
    process.exit(1);
  }

  try {
    execSync(`docker logs -f ${containerName}`, { stdio: 'inherit' });
  } catch (e) {
    logger.info(
      `${logger.YELLOW}${containerName}${logger.WHITE} is still running in the background. You can view the log stream anytime with ${logger.GREEN}Log WordPress Container`,
    );
  }
};

export default runContainer;
