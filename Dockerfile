# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the application source code to the working directory
COPY . .

# Expose the port the app listens on
EXPOSE 3000

# Define environment variables (optional, but good practice)
ENV NODE_ENV production
# ENV PORT=3000 # Port specified in the code, but can be overridden
# ENV MEGA_USERNAME=your_mega_username
# ENV MEGA_PASSWORD=your_mega_password

# Define the command to run the application
CMD [ "node", "index.js" ] # Or "npm start" if you have a "start" script in package.json
