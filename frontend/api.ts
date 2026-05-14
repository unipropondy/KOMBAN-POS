import axios from 'axios';
import { API_URL } from '@/constants/Config';

const API = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default API;
