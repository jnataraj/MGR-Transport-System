import axios from "axios";
import { API_BASE } from "../api";

const API = axios.create({
  baseURL: `${API_BASE}/auth`,
});

export const login = async (data) => {
  return API.post("/login", data);
};

export const register = async (data) => {
  return API.post("/register", data);
};

export const getProfile = async (token) => {
  return API.get("/profile", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
