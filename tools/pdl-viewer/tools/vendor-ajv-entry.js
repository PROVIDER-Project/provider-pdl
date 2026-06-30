import Ajv from "ajv";
import addFormats from "ajv-formats";

window.Ajv = Ajv;
window.ajvFormats = addFormats;
