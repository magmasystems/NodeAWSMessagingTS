FROM node:carbon

# Article on how to debug Node apps in Visual Studio Code
# https://alexanderzeitler.com/articles/debugging-a-nodejs-es6-application-in-a-docker-container-using-visual-studio-code/

# Set environment variables needed to build the app.
ENV http_proxy=
ENV https_proxy=
ENV HTTP_PROXY=
ENV HTTPS_PROXY=

# File Author / Maintainer
LABEL Marc Adler

WORKDIR /usr/local/src/app
COPY ./dist ./
COPY ./package*.json ./
COPY ./app.config.json ./
COPY ./awsCredentials.json ./

# temp fix for proxy issues. Remember to include node_modules back into the .dockerignore file
COPY ./node_modules ./node_modules/

# Set the http_proxy to null to stop it being used by the app.
ENV http_proxy=
WORKDIR /usr/local/src/app/

# Set NODE_ENV to an appropriate default value.
ENV NODE_ENV=production

EXPOSE 3050

# CMD ["node", "app.js"]
# Use this instead for debugging in Visual Studio Code
CMD ["node", "--inspect=0.0.0.0:5858", "app.js"]

