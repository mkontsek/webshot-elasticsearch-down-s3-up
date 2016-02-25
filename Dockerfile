FROM ubuntu:14.04
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
RUN apt-get install -y nodejs
RUN apt-get install -y phantomjs

WORKDIR /src

CMD npm start

# sudo docker build -t webshot-dh .
# sudo docker create -v /opt/dh-webshot/:/src --net="host" --name webshot-dh webshot-dh
