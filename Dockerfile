FROM node:15.14

LABEL version="1.0"
LABEL description="This is the docker image for the Spiking Neural Network engine controller connector API."
LABEL maintainer = "Louis Ross <louis.ross@gmail.com"

WORKDIR /app

COPY ["package.json", "package-lock.json", "/app/"]
RUN ls
#RUN npm install --production
RUN npm install
#COPY . .

EXPOSE 5000

CMD ["node", "backend.js"]
