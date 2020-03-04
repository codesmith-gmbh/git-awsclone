import * as inquirer from 'inquirer';
import * as ini from 'ini';
import * as os from 'os';
import * as path from "path";
import * as fs from 'fs';
import * as aws from 'aws-sdk';

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

interface Profiles {
    profiles: string[]
    regions: Map<string, string>
}

const fetchProfileNames = async (): Promise<Profiles> => {
    const configFileName = path.join(os.homedir(), ".aws", "config");
    const configFileContent = await fs.promises.readFile(configFileName, 'utf-8');
    const configFile = ini.parse(configFileContent);
    const profiles = [];
    let regions = new Map<string, string>();
    Object.keys(configFile).forEach((profile) => {
        const region = configFile[profile]?.region;
        if (region) {
            profiles.push(profile);
            regions = regions.set(profile, region);
        }
    });
    profiles.sort();
    return {profiles, regions};
};

const fetchRepositories = async (profile: string, region: string) => {
    const credentials = new aws.SharedIniFileCredentials({profile: profile});
    const codecommit = new aws.CodeCommit({apiVersion: '2015-04-13', credentials: credentials, region: region});
    const repositories = await codecommit.listRepositories().promise();
    const repositoryNames = repositories.repositories.map((rep) => rep.repositoryName);
    repositoryNames.sort();
    return repositoryNames;
};


const main = async () => {
    const profiles = await fetchProfileNames();
    const profileResponse = await inquirer.prompt([{
        type: 'autocomplete',
        name: 'profile',
        message: 'Which AWS profile to use?',
        suggestOnly: false,
        source: async (_, input) => {
            return input ?
                profiles.profiles.filter((profile) => (profile.startsWith(input))) : profiles.profiles;
        },
    }]);
    let profile = profileResponse.profile;
    let region = profiles.regions.get(profile);
    const repositories = await fetchRepositories(profile, region);
    const repositoryResponse = await inquirer.prompt([{
        type: 'autocomplete',
        name: 'repository',
        message: 'Which repository to clone?',
        suggestOnly: false,
        source: async (_, input) => {
            return input ?
                repositories.filter((repository) => repository.startsWith(input)) : repositories;
        }
    }]);
    const repository: string = repositoryResponse.repository;
    const gitCloneCommand = `git clone -c credential.useHttpPath=true -c credential.helper='!/usr/local/bin/aws codecommit --profile=${profile} credential-helper $@' https://git-codecommit.${region}.amazonaws.com/v1/repos/${repository}`;
    const shell = require('shelljs');
    await shell.exec(gitCloneCommand);
    return "done";
};

main().then(
    text => {
        console.log(text);
    },
    err => {
        console.error(err);
        process.exit(-1);
    }
);
