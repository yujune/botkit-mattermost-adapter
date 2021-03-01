FROM node:14

RUN mkdir -p /usr/src/app 
WORKDIR /usr/src/app 

COPY . /usr/src/app/

ENV MATTERMOST_HOST=10.13.18.140 \
    MATTERMOST_GROUP=ciro \
    MATTERMOST_ACCESS_TOKEN=skhmcpc39idbfbx6rec4jaanzc \
    MATTERMOST_WSS_PORT=443 \
    MATTERMOST_HTTP_PORT=30000 \
    MATTERMOST_TLS_VERIFY=false \
    MATTERMOST_USE_TLS=false \
    MATTERMOST_REPLY=true \
    STACKSTORM_URL='http://10.13.18.140:31518/api/v1/executions' \
    STACKSTORM_API_KEY='ZmQ2NDFiYjk2MzQwMGJkNzc0ZjBkMTNjZTVhMTgwMjc5NzU3YWYxNzMxN2M0N2RjOWM5MzVjM2IxMjVkNWIzOA' \
    NODE_TLS_REJECT_UNAUTHORIZED=0

RUN npm install
RUN /bin/bash -c "source /usr/src/app/.env"

#set startup commands
CMD ["npm", "start"]
