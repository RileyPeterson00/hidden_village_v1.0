# Hidden Village Project

## Getting started
First, we need to clone the repository 'https://github.com/IMolchanov620/hidden_village_v0.9.git'
We recommend you clone using SSH. If you don't have SSH configured to work with github, you can follow [these instructions](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).

## WINDOWS INSTRUCTIONS
Please install [WSL](https://docs.microsoft.com/en-us/windows/wsl/install) before proceeding. (Sometimes this is not needed)

## Create a development build of the app

There are few prerequisite pieces of software you will need to get started:
 - [installation of NVM](https://github.com/nvm-sh/nvm#installing-and-updating)
 - [installation of node](https://github.com/nvm-sh/nvm#usage)



After you installed yarn, you `change directory` or `cd` into the hidden_village directory (if you're not already there) and run:

You'll be able to run files and commands using node's npm command.
```
npm install
```

Npm package handler will install all the dependencies for the project in order to proceed. Downloaded packages from package.json will appear under node_modules. packageLock.json is the 'lock' file which ensures that all package/dependency versions are locked to the same version which ensures everyone is on the same version.

You can add new packages/dependencies to the package.json file so that they do not need to be installed everytime you open up a new repository of THV.

## Setting up backend and creating an admin

Access the [v0.9 GitHub Wiki](https://github.com/IMolchanov620/hidden_village_v0.9/wiki) for detailed instructions.

## Run a dev server
To serve the app locally,in terminal, run
```
npm run dev
 ```

you can then visit any of these URLs which influence the behavior of the THV app:  
 ```
 http://localhost:1234
 ```
 This is the default local app URL. The framerate (FPS) will be set to the default (which is normally 30)
 

## Documentation

To view the documentation for this project, either view our team's [Handover Document](https://mnscu-my.sharepoint.com/:b:/g/personal/ly4381wm_go_minnstate_edu/EcIRncwFvcxAueoWf7m-Xf0BHUDfVi4Cz3rqTDlKNXfomw?e=QuDyj3), which documents our work and resources throughout the semester, or view previous teams documentation: [Handover Document](https://mnscu-my.sharepoint.com/:w:/g/personal/ly4381wm_go_minnstate_edu/IQCKEGG46wRySqyiUCVqstc1AfjHErpj_3wHPjOecbtp3jU?e=G2PlRp) or [Technical Handover Document](https://docs.google.com/document/d/1eI24NwXav6k3-k5dBk0ZuRsePfPII5uO/edit?usp=sharing&ouid=109884013000152953925&rtpof=true&sd=true).



 
 
