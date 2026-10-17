package br.com.ticketflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class TicketFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(TicketFlowApplication.class, args);
    }
}
