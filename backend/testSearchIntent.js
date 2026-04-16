import { resolveDishQuery, tokenizeSearchText, getDishMatchScore } from "./services/searchIntent.js";

const query1 = "butter chicken";
console.log(`Tokens for '${query1}':`, tokenizeSearchText(query1));
console.log(`Resolved: '${resolveDishQuery(query1)}'`);

const query2 = "mong dal halwa";
console.log(`Tokens for '${query2}':`, tokenizeSearchText(query2));
console.log(`Resolved: '${resolveDishQuery(query2)}'`);

const restaurant = { name: "Burger King", cuisine: "burger, fast food", dishName: "" };
console.log(`Dish match score for '${query1}' against Burger King:`, getDishMatchScore(query1, restaurant));

const restaurant2 = { name: "KFC", cuisine: "burger, chicken", dishName: "" };
console.log(`Dish match score for '${query1}' against KFC:`, getDishMatchScore(query1, restaurant2));

const query3 = "burger";
console.log(`Tokens for '${query3}':`, tokenizeSearchText(query3));
console.log(`Resolved: '${resolveDishQuery(query3)}'`);

