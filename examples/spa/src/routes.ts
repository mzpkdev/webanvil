export const pageFor = (pathname: string) => {
  if (pathname === "/about") {
    return {
      body: "This SPA is built and served through Webanvil.",
      title: "About",
    };
  }

  return {
    body: "Webanvil forwards this project's commands to Vite+.",
    title: "Home",
  };
};
