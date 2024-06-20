const e = require("express");
const express = require("express");
const app = express();
const PORT = 3000;
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const cron = require("node-cron");

const orders = [];
let awaitingOrders = [];

const items = [
	{ id: "1", name: "Pizza", price: 1000 },
	{ id: "2", name: "Coke", price: 200 },
	{ id: "3", name: "Burger", price: 5000 },
	{ id: "4", name: "Fries", price: 300 },
	{ id: "5", name: "Pasta", price: 700 },
	{ id: "6", name: "Salad", price: 600 },
	{ id: "7", name: "Ice Cream", price: 400 },
	{ id: "8", name: "Sandwich", price: 1200 },
	{ id: "9", name: "Hot Dog", price: 800 },
	{ id: "10", name: "Milkshake", price: 900 },
];

const reOrderMenu = [
	"00 to go to the main menu",
	"0 to cancel order",
	"1 to place a new order",
	"99 to checkout the order",
];

const getMainMenuMessage = () => {
	return options
		.map((option) => {
			return `Select ${option.value} to ${option.description}`;
		})
		.join("\n");
};

const sendTimeoutMessage = (fn) => {
	setTimeout(() => {
		fn();
	}, 500);
};

/**
 * Sorts the items and calculates the count and total price for each item.
 *
 * @param {Array} items - The array of items to be sorted.
 * @returns {Object} - An object containing the sorted items with their count and total price.
 */
const sortItems = (items) => {
	const arrangedOrders = {};
	items.forEach((item) => {
		if (arrangedOrders[item.name])
			arrangedOrders[item.name] = {
				count: arrangedOrders[item.name].count + 1,
				total: arrangedOrders[item.name].total + item.price,
			};
		else
			arrangedOrders[item.name] = {
				count: 1,
				total: item.price,
			};
	});

	return arrangedOrders;
};

const currentOrder = ({ sessionID }) => {
	const orders = awaitingOrders.find((order) => order.user === sessionID);
	if (!orders) return "You currently have no active order.";

	const arrangedOrders = sortItems(orders.items);

	return Object.keys(arrangedOrders)
		.map(
			(key) =>
				`${key} - ${arrangedOrders[key].count} - $${arrangedOrders[key].total}`
		)
		.join("\n", ",");
};

const placeOrder = () => {
	io.emit("mode", "order");
	return items
		.map((item) => `${item.id} - ${item.name} - $${item.price}`)
		.join("\n", ",");
};

const orderHistory = ({ sessionID }) => {
	return orders
		.filter((item) => item.user === sessionID)
		.map((order) => {
			const date = new Date(order.timestamp);
			const arrangedOrders = sortItems(order.items);
			const items = Object.keys(arrangedOrders)
				.map(
					(key) =>
						`${key} - ${arrangedOrders[key].count} - $${arrangedOrders[key].total}`
				)
				.join("\n");
			return `${
				date.getDate() - 1
			}/${date.getMonth()}/${date.getFullYear()} \n ${items}`;
		})
		.join("\n");
};

const checkoutOrder = ({ sessionID }) => {
	const order = awaitingOrders.find((order) => order.user === sessionID);
	if (order) {
		// Add to the global completed orders array, and remove it from the awaiting orders array.
		orders.push({ ...order, timestamp: new Date() });
		awaitingOrders = awaitingOrders.filter(
			(order) => order.user !== sessionID
		);
		return "Sucessfully completed order.";
	} else return "You have no order to checkout.";
};

const cancelOrder = ({ sessionID }) => {
	// Cancels Order.
	const currOrder = awaitingOrders.find((order) => order.user === sessionID);

	if (currOrder) {
		awaitingOrders = awaitingOrders.filter(
			(item) => item.user !== sessionID
		);
		return "Order cancelled.";
	} else return "No order to cancel.";
};

const options = [
	{
		value: "1",
		description: "Place an order",
		action: placeOrder,
	},
	{ value: "97", description: "See current order", action: currentOrder },
	{ value: "98", description: "See order history", action: orderHistory },
	{ value: "99", description: "Checkout order", action: checkoutOrder },
	{ value: "0", description: "Cancel order", action: cancelOrder },
];

/**
 * Handles the incoming message and performs the corresponding actions based on the message mode.
 *
 * @param {Object} params - The parameters for handling the message.
 * @param {Object} params.message - The incoming message object.
 * @param {string} params.sessionID - The session ID of the user.
 * @returns {string} - The response message based on the actions performed.
 */
const handleMessage = ({ message, sessionID }) => {
	if (message.mode === "menu") {
		const optionExists = options.find(
			(option) => option.value === message.value
		);
		if (!optionExists) return "Invalid option.";
		const data = optionExists.action({ sessionID });
		return data;
	} else if (message.mode === "order") {
		const item = items.find((item) => item.id === message.value);
		if (!item) return "Item not found.";

		const currOrder = awaitingOrders.find(
			(order) => order.user === sessionID
		);

		if (!currOrder) awaitingOrders.push({ user: sessionID, items: [item] });
		else currOrder.items.push(item);

		io.emit("mode", "re-order");

		// Sends the re-order menu
		sendTimeoutMessage(() => io.emit("message", reOrderMenu.join("\n")));

		return `Added ${item.name} to your order.`;
	} else if (message.mode === "re-order") {
		if (message.value === "99") {
			// Checkout order
			io.emit("mode", "menu");

			sendTimeoutMessage(() => io.emit("message", getMainMenuMessage()));
			return checkoutOrder({ sessionID });
		} else if (message.value == "1") {
			// Place new order
			// sendTimeoutMessage(() => io.emit("message", getMainMenuMessage()));
			return placeOrder();
		} else if (message.value == "0") {
			// Cancel order
			io.emit("mode", "menu");
			sendTimeoutMessage(() => io.emit("message", getMainMenuMessage()));
			return cancelOrder({ sessionID });
		} else if (message.value == "00") {
			// Go to main menu
			io.emit("mode", "menu");
			sendTimeoutMessage(() => io.emit("message", getMainMenuMessage()));
		} else return "Invalid option.";
	}
};

io.on("connection", (socket) => {
	socket.emit("connected", getMainMenuMessage());

	socket.on("message", (message) => {
		socket.emit(
			"message",
			handleMessage({
				message: { value: message.value, mode: message.mode },
				sessionID: message.username,
			})
		);
	});
});

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views" + "/index.html");
});

server.listen(PORT, () => {
	console.log(`listening on *:${PORT}`);
});

cron.schedule("*/1 * * * *", () => {
	// Clear the orders array every day at midnight.
	console.log("Clearing all orders that are older than 30 minutes");
	const now = new Date().getTime();
	orders = orders.filter((order) => now - order.timestamp <= 30 * 60 * 1000);
});
